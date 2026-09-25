import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  createVerify,
  generateKeyPairSync,
} from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createGitHubAppJwt,
  createGitHubInstallState,
  readGitHubAppConfigStatus,
  verifyGitHubInstallState,
  verifyGitHubWebhookSignature,
  verifyInstallationAccessibleToUser,
  type GitHubAppConfig,
} from "./github-app";

function appConfig(): GitHubAppConfig {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    appId: "12345",
    slug: "vetolayer-test",
    clientId: "Iv1.test",
    clientSecret: "client-secret",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    webhookSecret: "webhook-secret",
  };
}

describe("GitHub App configuration and JWT", () => {
  it("requires the complete GitHub App server configuration", () => {
    const status = readGitHubAppConfigStatus({
      GITHUB_APP_ID: "1",
      GITHUB_APP_SLUG: "vetolayer",
    } as NodeJS.ProcessEnv);
    expect(status.configured).toBe(false);
    expect(status.missing).toContain("GITHUB_APP_PRIVATE_KEY");
    expect(status.missing).toContain("GITHUB_APP_WEBHOOK_SECRET");
  });

  it("signs an RS256 app JWT with a bounded lifetime", () => {
    const config = appConfig();
    const now = Date.UTC(2026, 8, 25, 6, 0, 0);
    const token = createGitHubAppJwt(config, now);
    const [header, payload, signature] = token.split(".");
    expect(header && payload && signature).toBeTruthy();
    expect(JSON.parse(Buffer.from(header!, "base64url").toString("utf8"))).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as { iss: string; iat: number; exp: number };
    expect(claims.iss).toBe(config.appId);
    expect(claims.exp - claims.iat).toBe(9 * 60);

    const publicKey = createPublicKey(createPrivateKey(config.privateKey));
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    verifier.end();
    expect(verifier.verify(publicKey, Buffer.from(signature!, "base64url"))).toBe(true);
  });
});

describe("GitHub installation state", () => {
  const scope = { workspaceId: "ws_a", projectId: "prj_a", environmentId: "env_prod" };

  it("binds a short-lived install request to user and product scope", () => {
    const now = Date.UTC(2026, 8, 25, 6, 0, 0);
    const token = createGitHubInstallState({ userId: "user-a", scope, returnTo: "/dashboard/integrations", signingSecret: "secret", installationId: 42, now });
    const state = verifyGitHubInstallState(token, "secret", now + 60_000);
    expect(state.userId).toBe("user-a");
    expect(state.workspaceId).toBe("ws_a");
    expect(state.installationId).toBe(42);
  });

  it("rejects tampering and expiry", () => {
    const now = Date.UTC(2026, 8, 25, 6, 0, 0);
    const token = createGitHubInstallState({ userId: "user-a", scope, returnTo: "/dashboard/integrations", signingSecret: "secret", now });
    const [payload, signature] = token.split(".");
    const tampered = `${payload!.slice(0, -1)}${payload!.endsWith("a") ? "b" : "a"}.${signature}`;
    expect(() => verifyGitHubInstallState(tampered, "secret", now)).toThrow(/verified|malformed|invalid/i);
    expect(() => verifyGitHubInstallState(token, "secret", now + 11 * 60_000)).toThrow(/expired/i);
  });
});

describe("GitHub installation authorization boundary", () => {
  it("accepts only an installation the authorizing GitHub user can access for this App", async () => {
    const config = appConfig();
    let authorization = "";
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      authorization = String(new Headers(init?.headers).get("authorization"));
      return new Response(JSON.stringify({
        installations: [{
          id: 77,
          app_id: Number(config.appId),
          app_slug: config.slug,
          account: { id: 2, login: "octo-org", type: "Organization" },
          repository_selection: "selected",
          permissions: { checks: "read", contents: "read", pull_requests: "read" },
          events: ["pull_request"],
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    const installation = await verifyInstallationAccessibleToUser({ config, userToken: "temporary-user-token", installationId: 77, fetchImpl });
    expect(installation.account.login).toBe("octo-org");
    expect(authorization).toBe("Bearer temporary-user-token");
  });

  it("rejects a spoofed installation id not visible to the authorizing user", async () => {
    const config = appConfig();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ installations: [] }), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
    await expect(verifyInstallationAccessibleToUser({ config, userToken: "temporary-user-token", installationId: 999, fetchImpl })).rejects.toMatchObject({ code: "GITHUB_INSTALLATION_FORBIDDEN" });
  });

  it("rejects an installation belonging to a different GitHub App", async () => {
    const config = appConfig();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      installations: [{ id: 77, app_id: 999, app_slug: "another-app", account: { id: 2, login: "octo-org", type: "Organization" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
    await expect(verifyInstallationAccessibleToUser({ config, userToken: "temporary-user-token", installationId: 77, fetchImpl })).rejects.toMatchObject({ code: "GITHUB_INSTALLATION_WRONG_APP" });
  });
});

describe("GitHub webhook verification", () => {
  it("accepts the matching sha256 signature and rejects altered content", () => {
    const body = JSON.stringify({ action: "added", installation: { id: 77 } });
    const signature = `sha256=${createHmac("sha256", "hook-secret").update(body).digest("hex")}`;
    expect(verifyGitHubWebhookSignature({ body, signature, secret: "hook-secret" })).toBe(true);
    expect(verifyGitHubWebhookSignature({ body: `${body} `, signature, secret: "hook-secret" })).toBe(false);
    expect(verifyGitHubWebhookSignature({ body, signature: "sha1=bad", secret: "hook-secret" })).toBe(false);
  });
});

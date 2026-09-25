import { createHmac, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  clearGitHubInstallationToken,
  createGitHubAppJwt,
  getGitHubInstallationToken,
  missingRequiredGitHubPermissions,
  verifyGitHubWebhookSignature,
  type GitHubAppConfig,
} from "./github-app";
import { createMemoryGitHubAppStore, createStoredGitHubInstallation, createSupabaseGitHubAppStore } from "./github-app-store";

function config(): GitHubAppConfig {
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

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("GitHub App cryptographic boundaries", () => {
  it("signs an App JWT with the configured App id and short lifetime", () => {
    const jwt = createGitHubAppJwt(config(), Date.parse("2026-09-25T08:00:00Z"));
    const [, encodedPayload] = jwt.split(".");
    const payload = JSON.parse(Buffer.from(encodedPayload ?? "", "base64url").toString("utf8")) as { iss: string; iat: number; exp: number };
    expect(payload.iss).toBe("12345");
    expect(payload.exp - payload.iat).toBe(540);
  });

  it("verifies raw-body SHA-256 webhook signatures and rejects tampering", () => {
    const raw = JSON.stringify({ action: "opened", installation: { id: 77 } });
    const secret = "webhook-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    expect(verifyGitHubWebhookSignature(raw, signature, secret)).toBe(true);
    expect(verifyGitHubWebhookSignature(`${raw} `, signature, secret)).toBe(false);
    expect(verifyGitHubWebhookSignature(raw, "sha256=bad", secret)).toBe(false);
  });

  it("mints and reuses only short-lived server-side installation tokens", async () => {
    const app = config();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ token: "ghs_installation_secret", expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() }), { status: 201, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
    clearGitHubInstallationToken(456);
    const first = await getGitHubInstallationToken({ config: app, installationId: 456, fetchImpl });
    const second = await getGitHubInstallationToken({ config: app, installationId: 456, fetchImpl });
    expect(first).toBe("ghs_installation_secret");
    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clearGitHubInstallationToken(456);
  });

  it("detects missing least-privilege evidence permissions", () => {
    expect(missingRequiredGitHubPermissions({ pull_requests: "read", checks: "read", statuses: "read" })).toEqual([]);
    expect(missingRequiredGitHubPermissions({ pull_requests: "read", checks: "read" })).toEqual(["statuses"]);
  });
});

describe("GitHub App persistence boundaries", () => {
  it("consumes installation state exactly once and keeps scopes isolated", async () => {
    const store = createMemoryGitHubAppStore();
    await store.saveInstallState({ stateHash: "state-1", workspaceId: "ws-a", projectId: "prj-a", environmentId: "env-a", userId: "user-a", createdAt: "2026-09-25T08:00:00Z", expiresAt: "2026-09-25T08:10:00Z" });
    expect((await store.consumeInstallState("state-1"))?.userId).toBe("user-a");
    expect(await store.consumeInstallState("state-1")).toBeNull();

    const installation = createStoredGitHubInstallation({
      scope: { workspaceId: "ws-a", projectId: "prj-a", environmentId: "env-a" },
      metadata: { installationId: 99, accountId: 7, accountLogin: "acme", accountType: "Organization", repositorySelection: "selected", permissions: { pull_requests: "read", checks: "read", statuses: "read" }, suspended: false },
      installedByUserId: "user-a",
      state: "ready",
      now: "2026-09-25T08:00:00Z",
    });
    await store.saveInstallation(installation);
    expect(await store.getInstallation({ workspaceId: "ws-a", projectId: "prj-a", environmentId: "env-a" })).not.toBeNull();
    expect(await store.getInstallation({ workspaceId: "ws-b", projectId: "prj-a", environmentId: "env-a" })).toBeNull();
  });

  it("atomically consumes persisted install state with delete-and-return", async () => {
    const deleted = [{
      state_hash: "state-hash",
      workspace_id: "ws-a",
      project_id: "prj-a",
      environment_id: "env-a",
      user_id: "user-a",
      created_at: "2026-09-25T08:00:00Z",
      expires_at: "2026-09-25T08:10:00Z",
    }];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("DELETE");
      expect(new Headers(init?.headers).get("Prefer")).toBe("return=representation");
      return new Response(JSON.stringify(deleted), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const store = createSupabaseGitHubAppStore({ url: "https://example.supabase.co", serviceRoleKey: "service-role" }, fetchImpl);
    const state = await store.consumeInstallState("state-hash");
    expect(state).toMatchObject({ stateHash: "state-hash", workspaceId: "ws-a", userId: "user-a" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("preserves VetoLayer repository selection across GitHub repository refreshes", async () => {
    const store = createMemoryGitHubAppStore();
    const connectionId = "github_scope";
    const repos = [
      { repositoryId: 1, owner: "acme", name: "api", fullName: "acme/api", private: true, defaultBranch: "main" },
      { repositoryId: 2, owner: "acme", name: "web", fullName: "acme/web", private: true, defaultBranch: "main" },
    ];
    await store.replaceRepositories(connectionId, repos, "2026-09-25T08:00:00Z");
    await store.setConnectedRepositories(connectionId, [2], "2026-09-25T08:01:00Z");
    await store.replaceRepositories(connectionId, repos, "2026-09-25T08:02:00Z");
    const refreshed = await store.listRepositories(connectionId);
    expect(refreshed.find((repo) => repo.repositoryId === 1)?.connected).toBe(false);
    expect(refreshed.find((repo) => repo.repositoryId === 2)?.connected).toBe(true);
  });

  it("deduplicates webhook delivery ids", async () => {
    const store = createMemoryGitHubAppStore();
    expect(await store.claimWebhookDelivery("delivery-1", "pull_request", 99)).toBe(true);
    expect(await store.claimWebhookDelivery("delivery-1", "pull_request", 99)).toBe(false);
  });
});

describe("GitHub App route authorization contracts", () => {
  it("does not bind callback installation_id until state, workspace permission, and GitHub user authorization are verified", () => {
    const callback = source("../../app/api/integrations/github/callback/route.ts");
    expect(callback).toContain("consumeInstallState");
    expect(callback).toContain("pending.userId !== identity.userId");
    expect(callback).toContain("hasWorkspacePermission(membership.role, \"integrations.write\")");
    expect(callback).toContain("verifyUserInstallationAccess");
    expect(callback.indexOf("verifyUserInstallationAccess")).toBeLessThan(callback.indexOf("syncGitHubConnection"));
  });

  it("verifies webhook signatures before claiming deliveries or processing installation events", () => {
    const webhook = source("../../app/api/integrations/github/webhook/route.ts");
    expect(webhook).toContain("await request.text()");
    expect(webhook).toContain("verifyGitHubWebhookSignature");
    expect(webhook.indexOf("verifyGitHubWebhookSignature")).toBeLessThan(webhook.indexOf("claimWebhookDelivery"));
  });

  it("requires a connected repository before the GitHub evidence pipeline can run", () => {
    const evaluate = source("../../app/api/integrations/github/evaluate/route.ts");
    expect(evaluate).toContain("candidate.repositoryId === repositoryId && candidate.connected");
    expect(evaluate).toContain("getGitHubInstallationToken");
    expect(evaluate).toContain("evaluateGitHubPullRequest");
  });
});

import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ServerEnvironment } from "./env";
import type { GitHubAppConfig } from "./github-app";
import { getIntegrationReadiness, testDeveloperApiIntegration, testGitHubIntegration } from "./integration-health";

function environment(overrides: Partial<ServerEnvironment> = {}): ServerEnvironment {
  return {
    servConfigured: true,
    githubTokenConfigured: false,
    githubAppConfigured: true,
    persistenceConfigured: false,
    demoWorkspaceId: "demo",
    demoRateLimitPerMinute: 30,
    apiRateLimitPerMinute: 60,
    apiAuthConfigured: true,
    apiKey: "server-secret",
    ...overrides,
  };
}

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

describe("integration readiness", () => {
  it("requires both GitHub App registration and SERV configuration", () => {
    const readiness = getIntegrationReadiness({
      environment: environment({ githubAppConfigured: false, servConfigured: false }),
      nodeEnv: "production",
    });

    expect(readiness.github.ready).toBe(false);
    expect(readiness.github.missing).toEqual(["GitHub App registration", "SERV_API_KEY + SERV_MODEL"]);
  });

  it("requires bearer authentication for the public production Developer API", () => {
    const readiness = getIntegrationReadiness({ environment: environment({ apiAuthConfigured: false }), nodeEnv: "production" });
    expect(readiness.developerApi.state).toBe("needs-config");
    expect(readiness.developerApi.missing).toEqual(["VETOLAYER_API_KEY"]);
  });

  it("allows an unauthenticated Developer API only as a local/demo state", () => {
    const readiness = getIntegrationReadiness({ environment: environment({ apiAuthConfigured: false }), nodeEnv: "development" });
    expect(readiness.developerApi.ready).toBe(true);
    expect(readiness.developerApi.state).toBe("local-only");
  });
});

describe("integration tests", () => {
  it("validates the GitHub App identity server-side without exposing App secrets", async () => {
    const config = appConfig();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("authorization") ?? "";
      expect(authorization).toMatch(/^Bearer eyJ/);
      return new Response(JSON.stringify({ id: 12345, slug: "vetolayer-test", name: "VetoLayer" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    const result = await testGitHubIntegration({ environment: environment(), config, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.code).toBe("GITHUB_APP_READY");
    expect(result.details?.account).toBe("VetoLayer");
    expect(JSON.stringify(result)).not.toContain(config.privateKey);
    expect(JSON.stringify(result)).not.toContain(config.clientSecret);
  });

  it("keeps a valid GitHub App registration in warning state until SERV is configured", async () => {
    const config = appConfig();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 12345, slug: "vetolayer-test", name: "VetoLayer" }), { status: 200 })) as unknown as typeof fetch;
    const result = await testGitHubIntegration({ environment: environment({ servConfigured: false }), config, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.level).toBe("warning");
    expect(result.code).toBe("GITHUB_APP_READY_SERV_MISSING");
  });

  it("fails safely when GitHub rejects the App JWT", async () => {
    const result = await testGitHubIntegration({
      environment: environment(),
      config: appConfig(),
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 })) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GITHUB_APP_AUTH_FAILED");
  });

  it("flags missing production API authentication", () => {
    const result = testDeveloperApiIntegration({ environment: environment({ apiAuthConfigured: false }), nodeEnv: "production" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("API_KEY_MISSING");
  });
});

import { describe, expect, it, vi } from "vitest";
import type { ServerEnvironment } from "./env";
import { getIntegrationReadiness, testDeveloperApiIntegration, testGitHubIntegration } from "./integration-health";

function environment(overrides: Partial<ServerEnvironment> = {}): ServerEnvironment {
  return {
    servConfigured: true,
    githubTokenConfigured: true,
    persistenceConfigured: false,
    demoWorkspaceId: "demo",
    demoRateLimitPerMinute: 30,
    apiRateLimitPerMinute: 60,
    apiAuthConfigured: true,
    apiKey: "server-secret",
    ...overrides,
  };
}

describe("integration readiness", () => {
  it("requires both GitHub and SERV configuration for the GitHub gate", () => {
    const readiness = getIntegrationReadiness({
      environment: environment({ githubTokenConfigured: false, servConfigured: false }),
      nodeEnv: "production",
    });

    expect(readiness.github.ready).toBe(false);
    expect(readiness.github.missing).toEqual(["GITHUB_TOKEN", "SERV_API_KEY + SERV_MODEL"]);
  });

  it("requires bearer authentication for the public production Developer API", () => {
    const readiness = getIntegrationReadiness({
      environment: environment({ apiAuthConfigured: false }),
      nodeEnv: "production",
    });

    expect(readiness.developerApi.state).toBe("needs-config");
    expect(readiness.developerApi.missing).toEqual(["VETOLAYER_API_KEY"]);
  });

  it("allows an unauthenticated Developer API only as a local/demo state", () => {
    const readiness = getIntegrationReadiness({
      environment: environment({ apiAuthConfigured: false }),
      nodeEnv: "development",
    });

    expect(readiness.developerApi.ready).toBe(true);
    expect(readiness.developerApi.state).toBe("local-only");
  });
});

describe("integration tests", () => {
  it("returns an actionable error when the GitHub token is missing", async () => {
    const result = await testGitHubIntegration({
      environment: environment({ githubTokenConfigured: false }),
      githubToken: "",
      fetchImpl: vi.fn(),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("GITHUB_TOKEN_MISSING");
    expect(result.nextSteps?.join(" ")).toContain("GITHUB_TOKEN");
  });

  it("validates GitHub server-side without exposing the token", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(new Headers(init?.headers).get("authorization"))).toBe("Bearer top-secret-token");
      return new Response(JSON.stringify({ login: "octo-vetolayer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await testGitHubIntegration({
      environment: environment(),
      githubToken: "top-secret-token",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.code).toBe("GITHUB_CONNECTED");
    expect(result.details?.account).toBe("octo-vetolayer");
    expect(JSON.stringify(result)).not.toContain("top-secret-token");
  });

  it("keeps a valid GitHub connection in warning state until SERV is configured", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ login: "octo-vetolayer" }), { status: 200 })) as unknown as typeof fetch;
    const result = await testGitHubIntegration({
      environment: environment({ servConfigured: false }),
      githubToken: "token",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.level).toBe("warning");
    expect(result.code).toBe("GITHUB_CONNECTED_SERV_MISSING");
  });

  it("flags missing production API authentication", () => {
    const result = testDeveloperApiIntegration({
      environment: environment({ apiAuthConfigured: false }),
      nodeEnv: "production",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("API_KEY_MISSING");
  });
});

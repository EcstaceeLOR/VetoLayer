import { describe, expect, it } from "vitest";
import type { ServerEnvironment } from "./env";
import { getIntegrationReadiness, testDeveloperApiIntegration, testGitHubIntegration } from "./integration-health";

function environment(overrides: Partial<ServerEnvironment> = {}): ServerEnvironment {
  return {
    servConfigured: true,
    githubTokenConfigured: false,
    githubAppConfigured: true,
    githubAppSlug: "vetolayer-test",
    githubAppMissing: [],
    persistenceConfigured: true,
    supabaseUrl: "https://example.supabase.co",
    supabaseServiceRoleKey: "service-role",
    demoWorkspaceId: "demo",
    demoRateLimitPerMinute: 30,
    apiRateLimitPerMinute: 60,
    apiAuthConfigured: true,
    apiKey: "server-secret",
    ...overrides,
  };
}

describe("integration readiness", () => {
  it("requires GitHub App registration, persistence, and SERV for production GitHub readiness", () => {
    const readiness = getIntegrationReadiness({
      environment: environment({ githubAppConfigured: false, servConfigured: false }),
      nodeEnv: "production",
    });

    expect(readiness.github.ready).toBe(false);
    expect(readiness.github.missing).toEqual(["GitHub App registration", "SERV_API_KEY + SERV_MODEL"]);
    expect(readiness.github.setupMode).toBe("github-app");
  });

  it("requires durable persistence for production GitHub installations", () => {
    const readiness = getIntegrationReadiness({
      environment: environment({ persistenceConfigured: false, supabaseUrl: undefined, supabaseServiceRoleKey: undefined }),
      nodeEnv: "production",
    });
    expect(readiness.github.ready).toBe(false);
    expect(readiness.github.missing).toContain("SUPABASE persistence");
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

describe("integration infrastructure tests", () => {
  it("returns an operator-level error when the GitHub App registration is missing", () => {
    const result = testGitHubIntegration({
      environment: environment({ githubAppConfigured: false }),
      nodeEnv: "production",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GITHUB_APP_NOT_CONFIGURED");
  });

  it("keeps GitHub App infrastructure in warning state until SERV is configured", () => {
    const result = testGitHubIntegration({
      environment: environment({ servConfigured: false }),
      nodeEnv: "production",
    });
    expect(result.ok).toBe(true);
    expect(result.level).toBe("warning");
    expect(result.code).toBe("GITHUB_APP_READY_SERV_MISSING");
  });

  it("reports the deployment-level GitHub App as ready when infrastructure is complete", () => {
    const result = testGitHubIntegration({ environment: environment(), nodeEnv: "production" });
    expect(result.ok).toBe(true);
    expect(result.code).toBe("GITHUB_APP_READY");
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

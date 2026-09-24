import { describe, expect, it } from "vitest";
import type { ServerEnvironment } from "./env";
import { developerApiWorkspaceId } from "./api-workspace";

function environment(): ServerEnvironment {
  return {
    servConfigured: false,
    githubTokenConfigured: false,
    persistenceConfigured: false,
    demoWorkspaceId: "demo",
    demoRateLimitPerMinute: 30,
    apiRateLimitPerMinute: 60,
    apiAuthConfigured: true,
    apiKey: "server-secret",
  };
}

function env(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

describe("Developer API workspace binding", () => {
  it("uses the server-configured API workspace", () => {
    expect(
      developerApiWorkspaceId(
        environment(),
        env({ VETOLAYER_API_WORKSPACE_ID: "service:prod-agents" }),
      ),
    ).toBe("service:prod-agents");
  });

  it("falls back to a dedicated service workspace, never the demo workspace", () => {
    expect(developerApiWorkspaceId(environment(), env())).toBe("service:developer-api");
  });
});

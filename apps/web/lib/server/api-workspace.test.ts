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

describe("Developer API workspace binding", () => {
  it("uses the server-configured API workspace", () => {
    expect(
      developerApiWorkspaceId(environment(), {
        VETOLAYER_API_WORKSPACE_ID: "service:prod-agents",
      }),
    ).toBe("service:prod-agents");
  });

  it("falls back to a server-owned service workspace, never a caller value", () => {
    expect(developerApiWorkspaceId(environment(), {})).toBe("service:demo");
  });
});

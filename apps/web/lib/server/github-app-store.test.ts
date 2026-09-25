import { describe, expect, it } from "vitest";
import { connectionFromGitHub, createMemoryGitHubAppStore } from "./github-app-store";

function connection(scope: { workspaceId: string; projectId: string; environmentId: string }, installationId: number) {
  return connectionFromGitHub({
    scope,
    installation: {
      id: installationId,
      appId: 123,
      appSlug: "vetolayer",
      account: { id: 99, login: "octo-org", type: "Organization" },
      repositorySelection: "selected",
      permissions: { checks: "read", contents: "read", pull_requests: "read" },
      events: ["pull_request"],
    },
    repositories: [{
      id: 1,
      name: "api",
      fullName: "octo-org/api",
      private: true,
      htmlUrl: "https://github.com/octo-org/api",
      defaultBranch: "main",
      archived: false,
      disabled: false,
    }],
    connectedByUserId: "11111111-1111-1111-1111-111111111111",
    now: "2026-09-25T06:00:00.000Z",
  });
}

describe("GitHub App store", () => {
  it("isolates installations by workspace, project, and environment", async () => {
    const store = createMemoryGitHubAppStore();
    const firstScope = { workspaceId: "ws-a", projectId: "prj-a", environmentId: "env-prod" };
    const secondScope = { workspaceId: "ws-a", projectId: "prj-b", environmentId: "env-prod" };
    await store.save(connection(firstScope, 77));
    await store.save(connection(secondScope, 88));

    expect((await store.list(firstScope)).map((item) => item.installationId)).toEqual([77]);
    expect((await store.list(secondScope)).map((item) => item.installationId)).toEqual([88]);
    expect(await store.get(firstScope, 88)).toBeNull();
  });

  it("persists installation metadata without any token field", () => {
    const record = connection({ workspaceId: "ws-a", projectId: "prj-a", environmentId: "env-prod" }, 77);
    const serialized = JSON.stringify(record).toLowerCase();
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("user_token");
    expect(Object.keys(record)).not.toContain("token");
  });
});

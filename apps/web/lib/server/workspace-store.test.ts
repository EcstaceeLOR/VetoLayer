import { describe, expect, it } from "vitest";
import { createMemoryWorkspaceStore } from "./workspace-store";

describe("workspace store isolation", () => {
  it("keeps unrelated users out of each other's workspace membership", async () => {
    const store = createMemoryWorkspaceStore();
    const alpha = await store.createWorkspace({ ownerUserId: "user-a", ownerEmail: "a@example.com", workspaceName: "Alpha", projectName: "Agent API" });
    await store.createWorkspace({ ownerUserId: "user-b", ownerEmail: "b@example.com", workspaceName: "Beta", projectName: "Payments" });

    expect((await store.listWorkspacesForUser("user-a")).map((item) => item.workspace.name)).toEqual(["Alpha"]);
    expect(await store.getMembership(alpha.workspace.id, "user-b")).toBeNull();
  });

  it("validates project and environment parent relationships", async () => {
    const store = createMemoryWorkspaceStore();
    const alpha = await store.createWorkspace({ ownerUserId: "user-a", workspaceName: "Alpha", projectName: "Agent API" });
    const beta = await store.createWorkspace({ ownerUserId: "user-b", workspaceName: "Beta", projectName: "Payments" });

    expect(await store.getProject(alpha.workspace.id, beta.project.id)).toBeNull();
    expect(await store.getEnvironment(alpha.workspace.id, alpha.project.id, beta.environments[0]!.id)).toBeNull();
    expect((await store.listEnvironments(alpha.workspace.id, alpha.project.id)).length).toBe(3);
  });

  it("archives entities without deleting their historical identity", async () => {
    const store = createMemoryWorkspaceStore();
    const graph = await store.createWorkspace({ ownerUserId: "user-a", workspaceName: "Alpha", projectName: "Agent API" });
    await store.archiveProject(graph.workspace.id, graph.project.id);

    expect(await store.getProject(graph.workspace.id, graph.project.id)).toMatchObject({ status: "archived" });
    expect(await store.listProjects(graph.workspace.id)).toEqual([]);
    expect((await store.listProjects(graph.workspace.id, true))[0]).toMatchObject({ id: graph.project.id, status: "archived" });
  });
});

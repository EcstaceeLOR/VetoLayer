import { describe, expect, it } from "vitest";
import { createMemoryAuditStore } from "./audit-store";

function event(overrides: Partial<Parameters<ReturnType<typeof createMemoryAuditStore>["append"]>[0]> = {}) {
  return {
    workspaceId: "ws_alpha",
    projectId: "prj_api",
    environmentId: "env_prod",
    actorKind: "human" as const,
    actorUserId: "user_1",
    actorLabel: "Ada Reviewer",
    actorRole: "admin",
    action: "policy.activate",
    category: "policy" as const,
    targetType: "policy_version",
    targetId: "pv_1",
    targetLabel: "Production deploy gate v2",
    href: "/dashboard/policies?focus=policy_1&version=2",
    requestId: "req_1",
    metadata: { version: 2 },
    createdAt: "2026-09-25T10:00:00.000Z",
    ...overrides,
  };
}

describe("audit store", () => {
  it("isolates workspaces even when targets and actors have the same names", async () => {
    const store = createMemoryAuditStore();
    await store.append(event());
    await store.append(event({ workspaceId: "ws_beta", id: "audit_beta", projectId: "prj_api", targetId: "pv_1" }));

    const alpha = await store.list("ws_alpha");
    const beta = await store.list("ws_beta");
    expect(alpha).toHaveLength(1);
    expect(alpha[0]?.workspaceId).toBe("ws_alpha");
    expect(beta).toHaveLength(1);
    expect(beta[0]?.workspaceId).toBe("ws_beta");
  });

  it("supports actor, action, resource, project, environment and date filters", async () => {
    const store = createMemoryAuditStore();
    await store.append(event());
    await store.append(event({
      id: "audit_review",
      actorUserId: "user_2",
      actorLabel: "Grace Reviewer",
      action: "review.assign",
      category: "review",
      targetType: "review_case",
      targetId: "review_9",
      targetLabel: "Deploy production",
      createdAt: "2026-09-25T11:00:00.000Z",
    }));

    expect(await store.list("ws_alpha", { actor: "ada" })).toHaveLength(1);
    expect(await store.list("ws_alpha", { action: "review" })).toHaveLength(1);
    expect(await store.list("ws_alpha", { resource: "production deploy" })).toHaveLength(1);
    expect(await store.list("ws_alpha", { projectId: "prj_api", environmentId: "env_prod" })).toHaveLength(2);
    expect(await store.list("ws_alpha", { from: "2026-09-25T10:30:00.000Z" })).toHaveLength(1);
    expect(await store.list("ws_alpha", { to: "2026-09-25T10:30:00.000Z" })).toHaveLength(1);
    expect(await store.list("ws_alpha", { before: "2026-09-25T11:00:00.000Z" })).toHaveLength(1);
  });

  it("creates isolated memory-store instances", async () => {
    const first = createMemoryAuditStore();
    const second = createMemoryAuditStore();
    await first.append(event());
    expect(await first.list("ws_alpha")).toHaveLength(1);
    expect(await second.list("ws_alpha")).toHaveLength(0);
  });

  it("exposes append and list only so normal product code cannot mutate historical rows", () => {
    const store = createMemoryAuditStore() as unknown as Record<string, unknown>;
    expect(Object.keys(store).sort()).toEqual(["append", "list"]);
    expect(store.update).toBeUndefined();
    expect(store.delete).toBeUndefined();
  });
});

import type { Policy } from "@vetolayer/core";
import { describe, expect, it } from "vitest";
import { materializePolicyVersion } from "../policy-lifecycle";
import { createMemoryPolicyLifecycleStore } from "./policy-lifecycle-store";

const policy: Policy = {
  id: "template-id",
  name: "Protected production change",
  description: "Route protected production changes to review.",
  mode: "deterministic",
  severity: "high",
  priority: 20,
  enabled: false,
  requiredEvidence: [],
  exceptions: [],
  scope: { environments: ["production"] },
  rule: { effect: "review", match: "all", conditions: [{ field: "facts.protected", operator: "equals", value: true }] },
};

describe("PolicyLifecycleStore", () => {
  it("keeps published versions immutable, creates new drafts, and supports rollback", async () => {
    const store = createMemoryPolicyLifecycleStore();
    const scope = { workspaceId: `ws_${Date.now()}_a`, projectId: "project_a" };
    const draftV1 = await store.createInitialDraft({ ...scope, policy, targetEnvironmentIds: ["env_prod"], createdByUserId: "user_a" });
    expect(draftV1.state).toBe("draft");
    expect(materializePolicyVersion(draftV1).enabled).toBe(false);

    const activeV1 = await store.activateVersion(scope, draftV1.id);
    expect(activeV1.state).toBe("active");
    await expect(store.updateDraft({ ...scope, versionId: activeV1.id, policy: { ...policy, name: "Mutated" }, targetEnvironmentIds: ["env_prod"] })).rejects.toThrow(/immutable/i);

    const draftV2 = await store.forkDraft({ ...scope, sourceVersionId: activeV1.id, createdByUserId: "user_a", changeNote: "Tighten scope" });
    expect(draftV2.version).toBe(2);
    expect(draftV2.state).toBe("draft");
    const savedV2 = await store.updateDraft({ ...scope, versionId: draftV2.id, policy: { ...policy, priority: 10 }, targetEnvironmentIds: ["env_prod"], changeNote: "Higher precedence" });
    expect(savedV2.policy.priority).toBe(10);

    const activeV2 = await store.activateVersion(scope, savedV2.id);
    expect(activeV2.state).toBe("active");
    expect((await store.getVersion(scope, activeV1.id))?.state).toBe("archived");
    expect((await store.listActiveForEnvironment({ ...scope, environmentId: "env_prod" })).map((version) => version.version)).toEqual([2]);

    const rolledBack = await store.activateVersion(scope, activeV1.id);
    expect(rolledBack.state).toBe("active");
    expect((await store.getVersion(scope, activeV2.id))?.state).toBe("archived");
    expect((await store.listActiveForEnvironment({ ...scope, environmentId: "env_prod" })).map((version) => version.version)).toEqual([1]);
  });

  it("does not expose drafts or unrelated environments to live evaluation", async () => {
    const store = createMemoryPolicyLifecycleStore();
    const scope = { workspaceId: `ws_${Date.now()}_b`, projectId: "project_b" };
    const production = await store.createInitialDraft({ ...scope, policy, targetEnvironmentIds: ["env_prod"], createdByUserId: "user_b" });
    const staging = await store.createInitialDraft({ ...scope, policy: { ...policy, name: "Staging control" }, targetEnvironmentIds: ["env_stage"], createdByUserId: "user_b" });

    expect(await store.listActiveForEnvironment({ ...scope, environmentId: "env_prod" })).toEqual([]);
    await store.activateVersion(scope, production.id);
    await store.activateVersion(scope, staging.id);

    const prod = await store.listActiveForEnvironment({ ...scope, environmentId: "env_prod" });
    const stage = await store.listActiveForEnvironment({ ...scope, environmentId: "env_stage" });
    expect(prod).toHaveLength(1);
    expect(stage).toHaveLength(1);
    expect(prod[0]?.targetEnvironmentIds).toEqual(["env_prod"]);
    expect(stage[0]?.targetEnvironmentIds).toEqual(["env_stage"]);
  });

  it("allows only one editable draft for a logical policy", async () => {
    const store = createMemoryPolicyLifecycleStore();
    const scope = { workspaceId: `ws_${Date.now()}_c`, projectId: "project_c" };
    const first = await store.createInitialDraft({ ...scope, policy, targetEnvironmentIds: ["env_prod"], createdByUserId: "user_c" });
    await store.activateVersion(scope, first.id);
    await store.forkDraft({ ...scope, sourceVersionId: first.id, createdByUserId: "user_c" });
    await expect(store.forkDraft({ ...scope, sourceVersionId: first.id, createdByUserId: "user_c" })).rejects.toThrow(/editable draft/i);
  });
});

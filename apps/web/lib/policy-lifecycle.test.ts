import { createDecisionReceipt, evaluateAction, type Policy } from "@vetolayer/core";
import { evaluateDeterministicPolicies } from "@vetolayer/policies";
import { describe, expect, it } from "vitest";
import {
  diffPolicyVersions,
  groupPolicyVersions,
  materializePolicyVersion,
  parsePolicyVersionReference,
  policyActivationWarnings,
  policyVersionReference,
  type PolicyVersionRecord,
} from "./policy-lifecycle";

const basePolicy: Policy = {
  id: "logical-policy",
  name: "Production approval",
  description: "Require review when production approval is missing.",
  mode: "deterministic",
  severity: "high",
  priority: 20,
  enabled: false,
  requiredEvidence: [],
  exceptions: [],
  scope: { tools: ["github"], environments: ["production"] },
  rule: { effect: "review", match: "all", conditions: [{ field: "facts.approvalCount", operator: "less_than", value: 1 }] },
};

function version(overrides: Partial<PolicyVersionRecord> = {}): PolicyVersionRecord {
  return {
    id: "pv_1",
    workspaceId: "ws_1",
    projectId: "prj_1",
    policyId: "policy_1",
    version: 1,
    state: "active",
    policy: { ...basePolicy, id: "policy_1", enabled: true },
    targetEnvironmentIds: ["env_prod"],
    createdByUserId: "user_1",
    createdAt: "2026-09-25T10:00:00.000Z",
    updatedAt: "2026-09-25T10:00:00.000Z",
    publishedAt: "2026-09-25T10:00:00.000Z",
    ...overrides,
  };
}

describe("policy lifecycle model", () => {
  it("materializes a published version with an immutable version identity", () => {
    const record = version({ version: 7 });
    const policy = materializePolicyVersion(record);
    expect(policy.id).toBe("policy_1@v7");
    expect(policy.enabled).toBe(true);
    expect(parsePolicyVersionReference(policy.id)).toEqual({ policyId: "policy_1", version: 7 });
    expect(policyVersionReference("policy_1", 7)).toBe(policy.id);
  });

  it("groups versions without losing active, draft, and archived history", () => {
    const records = [
      version({ id: "v1", version: 1, state: "archived" }),
      version({ id: "v2", version: 2, state: "active" }),
      version({ id: "v3", version: 3, state: "draft" }),
    ];
    const grouped = groupPolicyVersions(records);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ policyId: "policy_1", state: "active", activeVersionId: "v2", draftVersionId: "v3", latestVersion: 3 });
    expect(grouped[0]?.versions.map((item) => item.version)).toEqual([3, 2, 1]);
  });

  it("detects overlapping deterministic conflicts before activation", () => {
    const candidate = version({
      id: "candidate",
      version: 2,
      state: "draft",
      policy: { ...basePolicy, id: "policy_candidate", enabled: false, rule: { effect: "allow", match: "all", conditions: basePolicy.mode === "deterministic" ? basePolicy.rule.conditions : [] } },
    });
    const active = version({
      id: "active",
      policyId: "policy_other",
      policy: { ...basePolicy, id: "policy_other", enabled: true, rule: { effect: "block", match: "all", conditions: basePolicy.mode === "deterministic" ? basePolicy.rule.conditions : [] } },
    });
    const warnings = policyActivationWarnings(candidate, [active]);
    expect(warnings.some((warning) => warning.code === "OVERLAPPING_DETERMINISTIC_EFFECTS" && warning.severity === "error")).toBe(true);
  });

  it("produces field-level version diffs", () => {
    const previous = version({ id: "previous", version: 1 });
    const next = version({ id: "next", version: 2, policy: { ...basePolicy, id: "policy_1", enabled: false, priority: 10 } });
    const diff = diffPolicyVersions(previous, next);
    expect(diff.some((entry) => entry.field === "policy.priority" && entry.before === "20" && entry.after === "10")).toBe(true);
  });

  it("writes the exact policy version reference into the signed Decision Receipt", async () => {
    const policy = materializePolicyVersion(version({ version: 4 }));
    const action = {
      id: "action_1",
      actor: { id: "agent_1", kind: "agent" as const },
      action: { type: "deployment", tool: "github", operation: "deploy-production", arguments: {} },
      target: { type: "service", id: "api", environment: "production" },
      context: { source: "test", environment: "production" },
      requestedAt: "2026-09-25T10:00:00.000Z",
    };
    const orchestration = await evaluateAction({ action, policies: [policy], facts: { approvalCount: 0 }, now: new Date("2026-09-25T10:00:00.000Z") }, {
      evaluateDeterministic: (input) => evaluateDeterministicPolicies(input),
    });
    const receipt = await createDecisionReceipt({ orchestration, action, policies: [policy], createdAt: new Date("2026-09-25T10:00:01.000Z") });
    expect(receipt.policiesEvaluated[0]?.id).toBe("policy_1@v4");
    expect(receipt.integrity.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

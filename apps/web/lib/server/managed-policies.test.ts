import type { Policy } from "@vetolayer/core";
import { describe, expect, it } from "vitest";
import type { PolicyVersionRecord } from "../policy-lifecycle";
import { composeManagedPolicySet } from "./managed-policies";

const managedPolicy: Policy = {
  id: "managed-control",
  name: "Managed control",
  description: "Managed governance control.",
  mode: "deterministic",
  severity: "high",
  priority: 10,
  enabled: true,
  requiredEvidence: [],
  exceptions: [],
  scope: { environments: ["production"] },
  rule: { effect: "block", match: "all", conditions: [{ field: "facts.blocked", operator: "equals", value: true }] },
};

const callerPolicy: Policy = {
  id: "caller-allow",
  name: "Caller allow",
  description: "Caller-controlled permissive rule.",
  mode: "deterministic",
  severity: "low",
  priority: 999,
  enabled: true,
  requiredEvidence: [],
  exceptions: [],
  rule: { effect: "allow", match: "all", conditions: [{ field: "facts.blocked", operator: "equals", value: true }] },
};

const version: PolicyVersionRecord = {
  id: "pv_managed",
  workspaceId: "ws",
  projectId: "project",
  policyId: "policy_managed",
  version: 3,
  state: "active",
  policy: managedPolicy,
  targetEnvironmentIds: ["env_prod"],
  createdByUserId: "user",
  createdAt: "2026-09-25T10:00:00.000Z",
  updatedAt: "2026-09-25T10:00:00.000Z",
  publishedAt: "2026-09-25T10:00:00.000Z",
};

describe("managed policy composition", () => {
  it("makes managed policies authoritative over untrusted API-supplied policies", () => {
    const result = composeManagedPolicySet([version], [callerPolicy]);
    expect(result.source).toBe("managed");
    expect(result.policies).toHaveLength(1);
    expect(result.policies[0]?.id).toBe("policy_managed@v3");
    expect(result.policies.some((policy) => policy.id === callerPolicy.id)).toBe(false);
  });

  it("can preserve trusted adapter safety policies without duplicating managed identities", () => {
    const sameStableId = { ...callerPolicy, id: managedPolicy.id } as Policy;
    const result = composeManagedPolicySet([version], [callerPolicy, sameStableId], { preserveTrustedFallback: true });
    expect(result.source).toBe("managed+trusted");
    expect(result.policies.map((policy) => policy.id)).toEqual(["policy_managed@v3", "caller-allow"]);
  });

  it("preserves the pre-lifecycle request policy path when no managed policies are active", () => {
    const result = composeManagedPolicySet([], [callerPolicy]);
    expect(result.source).toBe("request");
    expect(result.policies).toEqual([callerPolicy]);
  });
});

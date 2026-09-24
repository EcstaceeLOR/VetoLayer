import { describe, expect, it } from "vitest";
import { PolicySchema } from "@vetolayer/core";
import { evaluateDeterministicPolicies } from "@vetolayer/policies";
import {
  policyStudioSampleAction,
  policyStudioSampleEvidence,
  policyStudioSampleFacts,
  policyStudioStarters,
} from "./policy-studio";

describe("Policy Studio fixtures", () => {
  it("keeps every starter policy on the production Policy contract", () => {
    for (const policy of policyStudioStarters) expect(PolicySchema.safeParse(policy).success).toBe(true);
  });

  it("runs a deterministic studio policy through the real evaluator", () => {
    const approvalPolicy = policyStudioStarters.find((policy) => policy.id === "github-human-approval");
    expect(approvalPolicy?.mode).toBe("deterministic");
    if (!approvalPolicy) throw new Error("missing fixture");

    const result = evaluateDeterministicPolicies({
      action: policyStudioSampleAction,
      policies: [approvalPolicy],
      evidence: policyStudioSampleEvidence,
      facts: { ...policyStudioSampleFacts, approvalCount: 0 },
      now: new Date("2026-09-24T14:00:00.000Z"),
    });

    expect(result.outcome).toBe("REVIEW");
    expect(result.findings.some((finding) => finding.policyId === approvalPolicy.id)).toBe(true);
  });

  it("routes contextual studio policies onward rather than evaluating them deterministically", () => {
    const contextual = policyStudioStarters.find((policy) => policy.mode === "contextual");
    if (!contextual) throw new Error("missing contextual fixture");
    const result = evaluateDeterministicPolicies({
      action: policyStudioSampleAction,
      policies: [contextual],
      evidence: policyStudioSampleEvidence,
      facts: policyStudioSampleFacts,
      now: new Date("2026-09-24T14:00:00.000Z"),
    });
    expect(result.contextualPolicyIds).toContain(contextual.id);
  });
});

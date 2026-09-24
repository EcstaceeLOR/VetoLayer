import { describe, expect, it } from "vitest";
import {
  exampleActionRequests,
  exampleEvidence,
  type ContextualPolicy,
  type DeterministicPolicy,
  type Evidence,
} from "@vetolayer/core";
import { evaluateDeterministicPolicies } from "./evaluator";

const productionDeployBlock: DeterministicPolicy = {
  id: "pol_deploy_permission",
  name: "Production deploy permission",
  description: "Block production deployment when the actor lacks deploy permission.",
  mode: "deterministic",
  severity: "critical",
  priority: 1,
  enabled: true,
  requiredEvidence: [],
  exceptions: [],
  scope: {
    actionTypes: ["deployment"],
    environments: ["production"],
  },
  rule: {
    effect: "block",
    match: "all",
    conditions: [
      {
        field: "facts.permissions.canDeployProduction",
        operator: "equals",
        value: false,
      },
    ],
  },
};

const largeRefundReview: DeterministicPolicy = {
  id: "pol_large_refund",
  name: "Large refunds require review",
  description: "Route refunds at or above 500 USD to a human reviewer.",
  mode: "deterministic",
  severity: "high",
  priority: 10,
  enabled: true,
  requiredEvidence: [],
  exceptions: [],
  scope: { actionTypes: ["customer-refund"] },
  rule: {
    effect: "review",
    match: "all",
    conditions: [
      {
        field: "action.action.arguments.amount",
        operator: "greater_than_or_equal",
        value: 500,
      },
    ],
  },
};

const deployApprovalAllow: DeterministicPolicy = {
  id: "pol_deploy_approval",
  name: "Approved production deployment",
  description: "Allow the deterministic portion when a verified approval is fresh.",
  mode: "deterministic",
  severity: "high",
  priority: 20,
  enabled: true,
  requiredEvidence: [
    {
      key: "security-review",
      type: "review-approval",
      description: "Verified security reviewer approval",
      required: true,
      maxAgeSeconds: 600,
    },
  ],
  exceptions: [],
  scope: { actionTypes: ["deployment"], environments: ["production"] },
  rule: {
    effect: "allow",
    match: "all",
    conditions: [
      {
        field: "action.target.environment",
        operator: "equals",
        value: "production",
      },
    ],
  },
};

const authContextPolicy: ContextualPolicy = {
  id: "pol_auth_context",
  name: "Security exception judgment",
  description: "Reason about whether a restricted deployment exception applies.",
  mode: "contextual",
  severity: "critical",
  priority: 30,
  enabled: true,
  requiredEvidence: [],
  exceptions: [],
  scope: { actionTypes: ["deployment"] },
  instruction: "Determine whether the security-remediation exception applies.",
  decisionCriteria: ["Critical vulnerability evidence", "Required approval"],
};

describe("evaluateDeterministicPolicies", () => {
  it("short-circuits on an explicit hard BLOCK", () => {
    const result = evaluateDeterministicPolicies({
      action: exampleActionRequests.deployment,
      policies: [productionDeployBlock, deployApprovalAllow, authContextPolicy],
      facts: { permissions: { canDeployProduction: false } },
      evidence: [exampleEvidence.approval],
      now: new Date("2026-09-24T12:03:00Z"),
    });

    expect(result.outcome).toBe("BLOCK");
    expect(result.hardBlock).toBe(true);
    expect(result.appliedPolicyIds).toEqual(["pol_deploy_permission"]);
    expect(result.findings[0]?.status).toBe("fail");
    expect(result.contextualPolicyIds).toEqual(["pol_auth_context"]);
  });

  it("routes a deterministic threshold to REVIEW", () => {
    const result = evaluateDeterministicPolicies({
      action: exampleActionRequests.refund,
      policies: [largeRefundReview],
    });

    expect(result.outcome).toBe("REVIEW");
    expect(result.hardBlock).toBe(false);
    expect(result.findings[0]?.status).toBe("uncertain");
  });

  it("allows the deterministic path when requirements are satisfied", () => {
    const result = evaluateDeterministicPolicies({
      action: exampleActionRequests.deployment,
      policies: [deployApprovalAllow],
      evidence: [exampleEvidence.approval],
      now: new Date("2026-09-24T12:03:00Z"),
    });

    expect(result.outcome).toBe("ALLOW");
    expect(result.missingEvidence).toEqual([]);
    expect(result.findings[0]?.status).toBe("pass");
    expect(result.findings[0]?.evidenceIds).toEqual(["ev_approval_001"]);
  });

  it("fails safely to REVIEW when required evidence is stale", () => {
    const staleApproval: Evidence = {
      ...exampleEvidence.approval,
      id: "ev_old_approval",
      observedAt: "2026-09-24T10:00:00+00:00",
    };

    const result = evaluateDeterministicPolicies({
      action: exampleActionRequests.deployment,
      policies: [deployApprovalAllow],
      evidence: [staleApproval],
      now: new Date("2026-09-24T12:03:00Z"),
    });

    expect(result.outcome).toBe("REVIEW");
    expect(result.missingEvidence).toHaveLength(1);
    expect(result.missingEvidence[0]?.key).toBe("security-review");
  });

  it("routes applicable contextual policies onward without evaluating them", () => {
    const result = evaluateDeterministicPolicies({
      action: exampleActionRequests.deployment,
      policies: [authContextPolicy],
    });

    expect(result.outcome).toBe("ALLOW");
    expect(result.findings).toEqual([]);
    expect(result.appliedPolicyIds).toEqual([]);
    expect(result.contextualPolicyIds).toEqual(["pol_auth_context"]);
  });

  it("ignores disabled or out-of-scope policies", () => {
    const disabled = { ...largeRefundReview, id: "disabled", enabled: false };

    const result = evaluateDeterministicPolicies({
      action: exampleActionRequests.merge,
      policies: [disabled, productionDeployBlock],
      facts: { permissions: { canDeployProduction: false } },
    });

    expect(result.outcome).toBe("ALLOW");
    expect(result.appliedPolicyIds).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("fails safely when a numeric operator receives a non-numeric configured value", () => {
    const malformedPolicy: DeterministicPolicy = {
      ...largeRefundReview,
      id: "pol_bad_threshold",
      rule: {
        effect: "block",
        match: "all",
        conditions: [
          {
            field: "action.action.arguments.amount",
            operator: "greater_than",
            value: "five hundred",
          },
        ],
      },
    };

    const result = evaluateDeterministicPolicies({
      action: exampleActionRequests.refund,
      policies: [malformedPolicy],
    });

    expect(result.outcome).toBe("REVIEW");
    expect(result.hardBlock).toBe(false);
    expect(result.findings[0]?.status).toBe("uncertain");
  });

  it("supports any-match rules and membership checks", () => {
    const protectedEnvironmentPolicy: DeterministicPolicy = {
      ...productionDeployBlock,
      id: "pol_protected_env",
      rule: {
        effect: "review",
        match: "any",
        conditions: [
          {
            field: "action.target.environment",
            operator: "in",
            value: ["production", "staging"],
          },
          {
            field: "facts.emergency",
            operator: "equals",
            value: true,
          },
        ],
      },
    };

    const result = evaluateDeterministicPolicies({
      action: exampleActionRequests.deployment,
      policies: [protectedEnvironmentPolicy],
      facts: { emergency: false },
    });

    expect(result.outcome).toBe("REVIEW");
  });
});

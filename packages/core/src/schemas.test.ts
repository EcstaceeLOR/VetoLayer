import { describe, expect, it } from "vitest";
import { exampleActionRequests, exampleEvidence } from "./examples";
import {
  ActionRequestSchema,
  ContextualPolicySchema,
  DecisionSchema,
  DeterministicPolicySchema,
  EvidenceSchema,
} from "./schemas";

describe("ActionRequestSchema", () => {
  it("accepts representative deployment, merge, refund, and payment actions", () => {
    for (const request of Object.values(exampleActionRequests)) {
      expect(ActionRequestSchema.parse(request)).toEqual(request);
    }
  });

  it("rejects malformed requests and unknown actor kinds", () => {
    const malformed = {
      ...exampleActionRequests.deployment,
      actor: {
        ...exampleActionRequests.deployment.actor,
        kind: "robot-overlord",
      },
    };

    expect(ActionRequestSchema.safeParse(malformed).success).toBe(false);
    expect(
      ActionRequestSchema.safeParse({ id: "missing_everything_else" }).success,
    ).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    const request = {
      ...exampleActionRequests.merge,
      unexpected: true,
    };

    expect(ActionRequestSchema.safeParse(request).success).toBe(false);
  });
});

describe("EvidenceSchema", () => {
  it("accepts evidence backed by data or a reference", () => {
    for (const evidence of Object.values(exampleEvidence)) {
      expect(EvidenceSchema.parse(evidence)).toEqual(evidence);
    }
  });

  it("rejects evidence without data or a reference", () => {
    const invalid = {
      id: "ev_empty",
      type: "approval",
      source: { kind: "test" },
      observedAt: "2026-09-24T12:00:00+00:00",
      verification: { status: "unverified" },
    };

    expect(EvidenceSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("Policy schemas", () => {
  it("validates a deterministic hard rule", () => {
    const policy = {
      id: "pol_prod_approval",
      name: "Production approval required",
      description: "Production deployments require an approval signal.",
      severity: "critical",
      priority: 10,
      enabled: true,
      mode: "deterministic",
      requiredEvidence: [],
      exceptions: [],
      rule: {
        effect: "block",
        match: "all",
        conditions: [
          {
            field: "target.environment",
            operator: "equals",
            value: "production",
          },
          {
            field: "context.attributes.approved",
            operator: "not_equals",
            value: true,
          },
        ],
      },
    };

    expect(DeterministicPolicySchema.parse(policy)).toEqual(policy);
  });

  it("validates a contextual policy with an exception", () => {
    const policy = {
      id: "pol_restricted_window",
      name: "Restricted deployment window",
      description:
        "High-risk changes normally wait unless they remediate a critical incident.",
      severity: "high",
      priority: 20,
      enabled: true,
      mode: "contextual",
      requiredEvidence: [
        {
          key: "security-assessment",
          type: "security-assessment",
          description: "Current security assessment for the change",
          required: true,
        },
      ],
      exceptions: [
        {
          id: "critical-remediation",
          description: "Permit urgent remediation when the evidence supports it.",
          criteria: [
            "The change directly remediates a critical active security incident",
            "The required security checks passed",
          ],
          requiredEvidence: ["security-assessment", "review-approval"],
        },
      ],
      instruction:
        "Determine whether the deployment exception is justified by the supplied evidence and context.",
      decisionCriteria: [
        "The incident is critical and active",
        "The proposed change directly remediates the incident",
        "Required approvals and checks are present",
      ],
    };

    expect(ContextualPolicySchema.parse(policy)).toEqual(policy);
  });
});

describe("DecisionSchema", () => {
  const validDecision = {
    id: "dec_001",
    actionRequestId: "act_deploy_auth_001",
    outcome: "REVIEW",
    deterministicFindings: [],
    contextualFindings: [
      {
        id: "finding_001",
        policyId: "pol_restricted_window",
        source: "contextual",
        status: "uncertain",
        severity: "high",
        summary: "The critical-remediation exception lacks approval evidence.",
        evidenceIds: ["ev_ci_001"],
      },
    ],
    missingEvidence: [
      {
        key: "review-approval",
        type: "review-approval",
        description: "Authorized security reviewer approval",
        required: true,
      },
    ],
    contradictoryEvidence: [],
    appliedPolicyIds: ["pol_restricted_window"],
    confidence: 0.86,
    summary: "Human review is required until the missing approval is supplied.",
    decidedAt: "2026-09-24T12:00:05+00:00",
  } as const;

  it("accepts typed ALLOW/REVIEW/BLOCK decision data", () => {
    expect(DecisionSchema.parse(validDecision)).toEqual(validDecision);
  });

  it("rejects unknown decision outcomes and out-of-range confidence", () => {
    expect(
      DecisionSchema.safeParse({ ...validDecision, outcome: "MAYBE" }).success,
    ).toBe(false);
    expect(
      DecisionSchema.safeParse({ ...validDecision, confidence: 1.5 }).success,
    ).toBe(false);
  });
});

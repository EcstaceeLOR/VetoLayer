import { describe, expect, it } from "vitest";
import { exampleActionRequests, exampleEvidence } from "./examples";
import type { DecisionOrchestrationResult } from "./orchestrator";
import {
  createDecisionReceipt,
  decisionReceiptToJson,
  renderDecisionReceiptSummary,
  verifyDecisionReceipt,
  type DecisionReceipt,
} from "./receipts";
import type { ContextualPolicy } from "./schemas";

const policy = {
  id: "policy_restricted_window",
  name: "Restricted deployment window",
  description: "High-risk production changes require contextual judgment.",
  severity: "critical",
  priority: 1,
  enabled: true,
  mode: "contextual",
  requiredEvidence: [],
  exceptions: [
    {
      id: "critical-remediation",
      description: "Permit a critical security remediation when evidence is sufficient.",
      criteria: ["Critical incident exists", "Validation passed"],
      requiredEvidence: ["ci-status"],
    },
  ],
  instruction: "Evaluate the emergency remediation exception.",
  decisionCriteria: ["Use supplied evidence only"],
} satisfies ContextualPolicy;

function orchestrationFor(
  outcome: "ALLOW" | "REVIEW" | "BLOCK",
): DecisionOrchestrationResult {
  const findingStatus = outcome === "ALLOW" ? "pass" : outcome === "BLOCK" ? "fail" : "uncertain";

  return {
    decision: {
      id: `decision-${outcome.toLowerCase()}`,
      actionRequestId: exampleActionRequests.deployment.id,
      outcome,
      deterministicFindings: [],
      contextualFindings: [
        {
          id: `${policy.id}:contextual:1`,
          policyId: policy.id,
          source: "contextual",
          status: findingStatus,
          severity: "critical",
          summary: `Contextual policy resulted in ${outcome}.`,
          evidenceIds: [exampleEvidence.ciPassed.id],
        },
      ],
      missingEvidence:
        outcome === "REVIEW"
          ? [
              {
                key: "security-approval",
                type: "security-approval",
                description: "verified security approval",
                required: true,
              },
            ]
          : [],
      contradictoryEvidence: [],
      appliedPolicyIds: [policy.id],
      confidence: outcome === "REVIEW" ? 0.5 : 0.93,
      summary: `Decision outcome is ${outcome}.`,
      decidedAt: "2026-09-24T14:15:00.000Z",
    },
    trace: [
      {
        step: "policy-resolution",
        status: "completed",
        summary: "One policy resolved.",
        policyIds: [policy.id],
      },
      {
        step: "deterministic-evaluation",
        status: "completed",
        summary: "No hard block matched.",
      },
      {
        step: "contextual-evaluation",
        status: "completed",
        summary: `SERV returned ${outcome}.`,
        policyIds: [policy.id],
      },
      {
        step: "decision-combination",
        status: "completed",
        summary: `Final outcome is ${outcome}.`,
      },
    ],
    contextualTrace: {
      providerStatus: "ok",
      provider: "openserv-serv",
      requestId: `serv-${outcome.toLowerCase()}`,
      model: "serv-model",
    },
  };
}

describe("Decision Receipts", () => {
  for (const outcome of ["ALLOW", "REVIEW", "BLOCK"] as const) {
    it(`preserves the policy and evidence chain for ${outcome}`, async () => {
      const receipt = await createDecisionReceipt({
        orchestration: orchestrationFor(outcome),
        action: exampleActionRequests.deployment,
        policies: [policy],
        evidence: [exampleEvidence.ciPassed],
        createdAt: new Date("2026-09-24T14:16:00.000Z"),
      });

      expect(receipt.outcome).toBe(outcome);
      expect(receipt.policiesEvaluated[0]?.id).toBe(policy.id);
      expect(receipt.evidenceUsed[0]?.id).toBe(exampleEvidence.ciPassed.id);
      expect(receipt.exceptionPath[0]?.exceptionId).toBe("critical-remediation");
      expect(receipt.providerTrace?.requestId).toBe(`serv-${outcome.toLowerCase()}`);
      expect(receipt.integrity.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(await verifyDecisionReceipt(receipt)).toBe(true);
    });
  }

  it("detects modification after a receipt has been issued", async () => {
    const receipt = await createDecisionReceipt({
      orchestration: orchestrationFor("ALLOW"),
      action: exampleActionRequests.deployment,
      policies: [policy],
      evidence: [exampleEvidence.ciPassed],
      createdAt: new Date("2026-09-24T14:16:00.000Z"),
    });

    const tampered = structuredClone(receipt) as DecisionReceipt;
    tampered.decisionSummary = "This text was altered after the decision.";

    expect(await verifyDecisionReceipt(tampered)).toBe(false);
  });

  it("provides both human-readable text and stable machine-readable JSON", async () => {
    const receipt = await createDecisionReceipt({
      orchestration: orchestrationFor("REVIEW"),
      action: exampleActionRequests.deployment,
      policies: [policy],
      evidence: [exampleEvidence.ciPassed],
      createdAt: new Date("2026-09-24T14:16:00.000Z"),
    });

    const human = renderDecisionReceiptSummary(receipt);
    const machine = decisionReceiptToJson(receipt);

    expect(human).toContain("Outcome: REVIEW");
    expect(human).toContain("What would need to change");
    expect(JSON.parse(machine).integrity.hash).toBe(receipt.integrity.hash);
  });
});

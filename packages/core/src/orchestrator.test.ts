import { describe, expect, it, vi } from "vitest";
import { exampleActionRequests } from "./examples";
import type { ContextualPolicy, DeterministicPolicy, Finding } from "./schemas";
import {
  evaluateAction,
  type ContextualAdapterResult,
  type DeterministicAdapterResult,
} from "./orchestrator";

const deterministicPolicy = {
  id: "policy_required_approval",
  name: "Production approval",
  description: "Production deploys require approval.",
  severity: "critical",
  priority: 1,
  enabled: true,
  mode: "deterministic",
  requiredEvidence: [],
  exceptions: [],
  rule: {
    effect: "allow",
    match: "all",
    conditions: [{ field: "facts.approved", operator: "equals", value: true }],
  },
} satisfies DeterministicPolicy;

const contextualPolicy = {
  id: "policy_restricted_window",
  name: "Restricted deployment window",
  description: "High-risk changes require contextual judgment during a restricted window.",
  severity: "high",
  priority: 2,
  enabled: true,
  mode: "contextual",
  requiredEvidence: [],
  exceptions: [],
  instruction: "Judge whether the deployment is justified by current incident context.",
  decisionCriteria: ["Use supplied evidence only"],
} satisfies ContextualPolicy;

const deterministicFinding: Finding = {
  id: "policy_required_approval:allow",
  policyId: deterministicPolicy.id,
  source: "deterministic",
  status: "pass",
  severity: "critical",
  summary: "Required approval is present.",
  evidenceIds: [],
};

function deterministicResult(
  overrides: Partial<DeterministicAdapterResult> = {},
): DeterministicAdapterResult {
  return {
    outcome: "ALLOW",
    hardBlock: false,
    findings: [deterministicFinding],
    appliedPolicyIds: [deterministicPolicy.id],
    contextualPolicyIds: [],
    missingEvidence: [],
    ...overrides,
  };
}

function contextualResult(
  outcome: "ALLOW" | "REVIEW" | "BLOCK",
  overrides: Partial<ContextualAdapterResult> = {},
): ContextualAdapterResult {
  return {
    decision: {
      recommendedOutcome: outcome,
      policyFindings: [
        {
          policyId: contextualPolicy.id,
          status: outcome === "ALLOW" ? "pass" : outcome === "BLOCK" ? "fail" : "uncertain",
          summary: `Contextual outcome is ${outcome}.`,
          evidenceIds: [],
        },
      ],
      evidenceUsed: [],
      missingEvidence: [],
      contradictoryEvidence: [],
      exceptionAnalysis: [],
      rationale: `SERV recommends ${outcome}.`,
      confidence: 0.9,
    },
    trace: { providerStatus: "ok", requestId: "serv-1" },
    ...overrides,
  };
}

const now = new Date("2026-09-24T14:00:00.000Z");

describe("evaluateAction", () => {
  it("short-circuits on a deterministic hard BLOCK without calling contextual reasoning", async () => {
    const evaluateContextual = vi.fn();

    const result = await evaluateAction(
      {
        action: exampleActionRequests.deployment,
        policies: [deterministicPolicy, contextualPolicy],
        now,
        decisionId: "decision-hard-block",
      },
      {
        evaluateDeterministic: () =>
          deterministicResult({
            outcome: "BLOCK",
            hardBlock: true,
            contextualPolicyIds: [contextualPolicy.id],
          }),
        evaluateContextual,
      },
    );

    expect(result.decision.outcome).toBe("BLOCK");
    expect(evaluateContextual).not.toHaveBeenCalled();
    expect(result.trace.find((step) => step.step === "contextual-evaluation")?.status).toBe(
      "skipped",
    );
  });

  it("returns deterministic ALLOW when no contextual policy applies", async () => {
    const result = await evaluateAction(
      {
        action: exampleActionRequests.deployment,
        policies: [deterministicPolicy],
        now,
        decisionId: "decision-deterministic-allow",
      },
      { evaluateDeterministic: () => deterministicResult() },
    );

    expect(result.decision.outcome).toBe("ALLOW");
    expect(result.decision.contextualFindings).toHaveLength(0);
  });

  it("allows when deterministic enforcement and SERV contextual reasoning both allow", async () => {
    const result = await evaluateAction(
      {
        action: exampleActionRequests.deployment,
        policies: [deterministicPolicy, contextualPolicy],
        now,
        decisionId: "decision-serv-allow",
      },
      {
        evaluateDeterministic: () =>
          deterministicResult({ contextualPolicyIds: [contextualPolicy.id] }),
        evaluateContextual: () => contextualResult("ALLOW"),
      },
    );

    expect(result.decision.outcome).toBe("ALLOW");
    expect(result.decision.contextualFindings[0]?.source).toBe("contextual");
    expect(result.contextualTrace?.providerStatus).toBe("ok");
  });

  it("blocks when SERV contextual judgment requires BLOCK", async () => {
    const result = await evaluateAction(
      {
        action: exampleActionRequests.deployment,
        policies: [deterministicPolicy, contextualPolicy],
        now,
        decisionId: "decision-serv-block",
      },
      {
        evaluateDeterministic: () =>
          deterministicResult({ contextualPolicyIds: [contextualPolicy.id] }),
        evaluateContextual: () => contextualResult("BLOCK"),
      },
    );

    expect(result.decision.outcome).toBe("BLOCK");
  });

  it("keeps REVIEW when deterministic enforcement already requires human review", async () => {
    const result = await evaluateAction(
      {
        action: exampleActionRequests.deployment,
        policies: [deterministicPolicy, contextualPolicy],
        now,
        decisionId: "decision-ambiguous-review",
      },
      {
        evaluateDeterministic: () =>
          deterministicResult({
            outcome: "REVIEW",
            contextualPolicyIds: [contextualPolicy.id],
          }),
        evaluateContextual: () => contextualResult("ALLOW"),
      },
    );

    expect(result.decision.outcome).toBe("REVIEW");
  });

  it("falls back to REVIEW when the contextual provider fails", async () => {
    const result = await evaluateAction(
      {
        action: exampleActionRequests.deployment,
        policies: [deterministicPolicy, contextualPolicy],
        now,
        decisionId: "decision-provider-fallback",
      },
      {
        evaluateDeterministic: () =>
          deterministicResult({ contextualPolicyIds: [contextualPolicy.id] }),
        evaluateContextual: () =>
          contextualResult("REVIEW", {
            trace: { providerStatus: "fallback" },
            error: { code: "HTTP_ERROR", message: "SERV unavailable" },
          }),
      },
    );

    expect(result.decision.outcome).toBe("REVIEW");
    expect(result.trace.find((step) => step.step === "contextual-evaluation")?.status).toBe(
      "fallback",
    );
  });

  it("never allows when critical required evidence is missing", async () => {
    const criticalPolicyWithEvidence = {
      ...deterministicPolicy,
      requiredEvidence: [
        {
          key: "security-approval",
          type: "security-approval",
          description: "Verified security approval",
          required: true,
        },
      ],
    } satisfies DeterministicPolicy;

    const result = await evaluateAction(
      {
        action: exampleActionRequests.deployment,
        policies: [criticalPolicyWithEvidence],
        now,
        decisionId: "decision-missing-critical-evidence",
      },
      {
        evaluateDeterministic: () =>
          deterministicResult({
            missingEvidence: criticalPolicyWithEvidence.requiredEvidence,
          }),
      },
    );

    expect(result.decision.outcome).toBe("REVIEW");
  });
});

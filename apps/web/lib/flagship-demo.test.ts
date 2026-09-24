import { describe, expect, it, vi } from "vitest";
import {
  createFlagshipDemoHumanReview,
  runFlagshipDemo,
} from "./flagship-demo";

const servConfig = {
  apiKey: "test-key",
  model: "serv-test-model",
  baseUrl: "https://serv.example/v1",
};

function evidenceAwareServFetch() {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    const prompt = String(request.messages[1].content);
    const hasApproval = prompt.includes("security-lead");
    const outcome = hasApproval ? "ALLOW" : "REVIEW";

    const decision = {
      recommendedOutcome: outcome,
      policyFindings: [
        {
          policyId: "github-sensitive-change-context",
          status: hasApproval ? "pass" : "uncertain",
          summary: hasApproval
            ? "Critical-remediation context is supported and human approval is present."
            : "The remediation context is plausible but the required human approval is absent.",
          evidenceIds: [
            "github-files-312",
            "github-checks-secfix-312-a91f",
            "github-reviews-312",
            "incident-INC-2041",
          ],
        },
      ],
      evidenceUsed: [
        "github-files-312",
        "github-checks-secfix-312-a91f",
        "github-reviews-312",
        "incident-INC-2041",
      ],
      missingEvidence: hasApproval
        ? []
        : [
            {
              policyId: "github-sensitive-change-context",
              key: "security-lead-approval",
              description: "authorized security-lead approval",
            },
          ],
      contradictoryEvidence: [],
      exceptionAnalysis: [
        {
          policyId: "github-sensitive-change-context",
          exceptionId: "critical-security-remediation",
          applies: hasApproval,
          satisfiedCriteria: hasApproval
            ? [
                "The supplied context shows an urgent or critical security reason",
                "CI/check evidence is successful",
                "A human reviewer has approved the change",
              ]
            : [
                "The supplied context shows an urgent or critical security reason",
                "CI/check evidence is successful",
              ],
          unsatisfiedCriteria: hasApproval ? [] : ["A human reviewer has approved the change"],
          summary: hasApproval
            ? "The critical remediation exception is supported."
            : "The exception is not yet fully supported.",
        },
      ],
      rationale: hasApproval
        ? "The same urgent security action now satisfies both hard controls and the contextual exception."
        : "Human review is required because the security approval condition remains unresolved.",
      confidence: 0.95,
    };

    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }),
      { status: 200, headers: { "x-request-id": `serv-demo-${outcome.toLowerCase()}` } },
    );
  });
}

describe("flagship deployment demo", () => {
  it("re-evaluates the same action from REVIEW to ALLOW when human-review evidence changes", async () => {
    const fetchMock = evidenceAwareServFetch();
    const fixedNow = new Date("2026-09-24T15:00:00.000Z");

    const initial = await runFlagshipDemo("needs-approval", {
      servConfig,
      servFetch: fetchMock as typeof fetch,
      now: fixedNow,
    });
    const humanReview = createFlagshipDemoHumanReview(fixedNow);
    const resolved = await runFlagshipDemo("needs-approval", {
      servConfig,
      servFetch: fetchMock as typeof fetch,
      now: fixedNow,
      humanReview,
    });

    expect(initial.orchestration.decision.actionRequestId).toBe(
      resolved.orchestration.decision.actionRequestId,
    );
    expect(humanReview.decisionId).toBe(initial.receipt.decisionId);
    expect(initial.orchestration.decision.outcome).toBe("REVIEW");
    expect(resolved.orchestration.decision.outcome).toBe("ALLOW");
    expect(initial.receipt.requirementsToChangeOutcome.length).toBeGreaterThan(0);
    expect(resolved.receipt.integrity.hash).not.toBe(initial.receipt.integrity.hash);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

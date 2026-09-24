import { describe, expect, it } from "vitest";
import { dashboardDecisions } from "./dashboard-data";
import { evidenceCompletenessForReceipt, summarizeDecisionHealth } from "./decision-health";

describe("decision health analytics", () => {
  it("derives outcome, reasoning, tool, policy and review metrics from receipts", () => {
    const summary = summarizeDecisionHealth(dashboardDecisions);

    expect(summary.total).toBe(3);
    expect(summary.outcomes).toEqual({ ALLOW: 1, REVIEW: 1, BLOCK: 1 });
    expect(summary.servAssisted).toBe(2);
    expect(summary.deterministicOnly).toBe(1);
    expect(summary.unresolvedReviews).toBe(1);
    expect(summary.tools[0]).toEqual({ tool: "github", total: 3, friction: 2 });
    expect(summary.topPolicies.map((policy) => policy.policyId)).toContain("github-review-required");
    expect(summary.topPolicies.map((policy) => policy.policyId)).toContain("github-no-draft-actions");
  });

  it("does not count an older REVIEW as unresolved after the same action is later allowed", () => {
    const review = dashboardDecisions[1]!;
    const resolved = {
      ...review,
      receiptId: "receipt_resolved",
      decisionId: "decision_resolved",
      outcome: "ALLOW" as const,
      timestamps: {
        requestedAt: "2026-09-24T14:00:00.000Z",
        decidedAt: "2026-09-24T14:00:02.000Z",
        receiptCreatedAt: "2026-09-24T14:00:02.000Z",
      },
    };

    expect(summarizeDecisionHealth([review, resolved]).unresolvedReviews).toBe(0);
  });

  it("treats referenced evidence with no missing requirements as complete", () => {
    expect(evidenceCompletenessForReceipt(dashboardDecisions[0]!)).toBe(100);
  });
});

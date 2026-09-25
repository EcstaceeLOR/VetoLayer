import { describe, expect, it } from "vitest";
import { humanReviewToEvidence, type HumanReviewRecord } from "./reviews";

function record(action: HumanReviewRecord["action"]): HumanReviewRecord {
  return {
    id: `review-${action}`,
    decisionId: "decision-1",
    reviewer: { id: "reviewer-1", kind: "human", name: "Reviewer" },
    action,
    rationale: "Reviewed the available evidence.",
    requestedEvidence: action === "request_evidence" ? ["Current security validation"] : [],
    submittedAt: "2026-09-25T08:00:00.000Z",
  };
}

describe("humanReviewToEvidence", () => {
  it("only treats an explicit approval as review-approval evidence", () => {
    expect(humanReviewToEvidence(record("approve")).type).toBe("review-approval");
    expect(humanReviewToEvidence(record("reject")).type).toBe("review-rejection");
    expect(humanReviewToEvidence(record("request_evidence")).type).toBe("review-evidence-request");
  });
});

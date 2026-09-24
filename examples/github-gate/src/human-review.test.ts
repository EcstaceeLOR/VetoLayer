import { describe, expect, it, vi } from "vitest";
import {
  HumanReviewRecordSchema,
  verifyDecisionReceipt,
  type HumanReviewRecord,
} from "@vetolayer/core";
import { evaluateGitHubSnapshot } from "./gate";
import type { GitHubPullRequestSnapshot } from "./github-client";

const now = new Date("2026-09-24T15:00:00.000Z");
const servConfig = { apiKey: "test", model: "serv-test", baseUrl: "https://serv.example/v1" };

function snapshot(): GitHubPullRequestSnapshot {
  return {
    owner: "acme",
    repo: "identity-api",
    number: 312,
    title: "Patch session replay vulnerability",
    url: "https://github.com/acme/identity-api/pull/312",
    headSha: "secfix312",
    baseBranch: "main",
    draft: false,
    merged: false,
    changedFiles: [{ filename: "src/auth/session.ts", status: "modified", additions: 12, deletions: 3 }],
    reviews: [],
    checks: [{ name: "CI", status: "completed", conclusion: "success" }],
  };
}

function review(action: HumanReviewRecord["action"]): HumanReviewRecord {
  return HumanReviewRecordSchema.parse({
    id: `review-${action}`,
    decisionId: "decision-github",
    reviewer: { id: "security-lead", kind: "human", name: "Security Lead" },
    action,
    rationale: action === "approve" ? "The evidence and emergency exception criteria are satisfied." : action === "reject" ? "Risk remains unacceptable for production execution." : "Provide current owner approval before this action can proceed.",
    requestedEvidence: action === "request_evidence" ? ["Current owner approval"] : [],
    submittedAt: now.toISOString(),
  });
}

function servAllow() {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const prompt = String(body.messages[1].content);
    expect(prompt).toContain("github-sensitive-change-context");
    return new Response(
      JSON.stringify({
        id: "serv-human-review-test",
        choices: [{ message: { content: JSON.stringify({
          recommendedOutcome: "ALLOW",
          policyFindings: [{
            policyId: "github-sensitive-change-context",
            status: "pass",
            summary: "The supplied evidence supports controlled execution.",
            evidenceIds: ["github-files-312", "github-checks-secfix312", "github-reviews-312"],
          }],
          evidenceUsed: ["github-files-312", "github-checks-secfix312", "github-reviews-312"],
          missingEvidence: [],
          contradictoryEvidence: [],
          exceptionAnalysis: [{
            policyId: "github-sensitive-change-context",
            exceptionId: "critical-security-remediation",
            applies: true,
            satisfiedCriteria: ["critical incident", "CI passed", "human review"],
            unsatisfiedCriteria: [],
            summary: "Emergency remediation exception is fully supported.",
          }],
          rationale: "SERV finds the documented emergency remediation exception fully supported.",
          confidence: 0.96,
        }) } }],
      }),
      { status: 200 },
    );
  });
}

describe("GitHub human review loop", () => {
  it("moves REVIEW to ALLOW only after approval is added as evidence and the full pipeline re-runs", async () => {
    const first = await evaluateGitHubSnapshot({ snapshot: snapshot(), servConfig, servFetch: servAllow() as typeof fetch, now });
    const humanReview = review("approve");
    const second = await evaluateGitHubSnapshot({ snapshot: snapshot(), humanReview, servConfig, servFetch: servAllow() as typeof fetch, now });

    expect(first.orchestration.decision.outcome).toBe("REVIEW");
    expect(second.orchestration.decision.outcome).toBe("ALLOW");
    expect(await verifyDecisionReceipt(second.receipt)).toBe(true);

    const reviewEvidence = second.receipt.evidenceUsed.find((item) => item.type === "review-approval");
    expect(reviewEvidence?.data).toMatchObject({
      vetoLayerReview: {
        reviewer: { id: "security-lead", name: "Security Lead" },
        action: "approve",
        rationale: humanReview.rationale,
        submittedAt: humanReview.submittedAt,
      },
    });
  });

  it("turns a human rejection into a hard BLOCK before SERV can override it", async () => {
    const provider = servAllow();
    const result = await evaluateGitHubSnapshot({
      snapshot: snapshot(),
      humanReview: review("reject"),
      servConfig,
      servFetch: provider as typeof fetch,
      now,
    });

    expect(result.orchestration.decision.outcome).toBe("BLOCK");
    expect(provider).not.toHaveBeenCalled();
  });

  it("keeps a request for more evidence in REVIEW even if SERV would otherwise allow", async () => {
    const result = await evaluateGitHubSnapshot({
      snapshot: snapshot(),
      humanReview: review("request_evidence"),
      servConfig,
      servFetch: servAllow() as typeof fetch,
      now,
    });
    expect(result.orchestration.decision.outcome).toBe("REVIEW");
  });
});

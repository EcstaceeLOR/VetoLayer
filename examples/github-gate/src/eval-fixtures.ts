import { vi } from "vitest";
import type { GitHubPullRequestSnapshot } from "./github-client";

export const EVAL_NOW = new Date("2026-09-24T15:30:00.000Z");
export const EVAL_SERV_CONFIG = {
  apiKey: "test-key",
  model: "serv-eval-model",
  baseUrl: "https://serv.example/v1",
};

export function evaluationSnapshot(
  overrides: Partial<GitHubPullRequestSnapshot> = {},
): GitHubPullRequestSnapshot {
  return {
    owner: "acme",
    repo: "identity-api",
    number: 42,
    title: "Patch authentication replay issue",
    url: "https://github.com/acme/identity-api/pull/42",
    headSha: "abc123",
    baseBranch: "main",
    draft: false,
    merged: false,
    changedFiles: [
      { filename: "src/auth/session.ts", status: "modified", additions: 24, deletions: 5 },
    ],
    reviews: [{ user: "security-lead", state: "APPROVED" }],
    checks: [{ name: "CI / verify", status: "completed", conclusion: "success" }],
    ...overrides,
  };
}

export function makeServDecision(input: {
  outcome?: "ALLOW" | "REVIEW" | "BLOCK";
  missingEvidence?: boolean;
  contradictory?: boolean;
}) {
  const outcome = input.outcome ?? "ALLOW";
  return {
    recommendedOutcome: outcome,
    policyFindings: [
      {
        policyId: "github-sensitive-change-context",
        status: outcome === "ALLOW" ? "pass" : outcome === "BLOCK" ? "fail" : "uncertain",
        summary: `Contextual evaluation produced ${outcome}.`,
        evidenceIds: ["github-files-42", "github-checks-abc123", "github-reviews-42"],
      },
    ],
    evidenceUsed: ["github-files-42", "github-checks-abc123", "github-reviews-42"],
    missingEvidence: input.missingEvidence
      ? [
          {
            policyId: "github-sensitive-change-context",
            key: "security-approval",
            description: "authorized security approval",
          },
        ]
      : [],
    contradictoryEvidence: input.contradictory
      ? [
          {
            evidenceIds: ["github-checks-abc123", "github-reviews-42"],
            description: "The supplied evidence contains conflicting execution-readiness signals.",
          },
        ]
      : [],
    exceptionAnalysis: [],
    rationale: `SERV recommends ${outcome}.`,
    confidence: 0.9,
  };
}

export function makeServFetch(decision: ReturnType<typeof makeServDecision>) {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }),
      { status: 200 },
    ),
  );
}

import {
  evaluateGitHubSnapshot,
  type GitHubIncidentContext,
  type GitHubPullRequestSnapshot,
} from "@vetolayer/github-gate";
import type { HumanReviewRecord } from "@vetolayer/core";

export type DemoStage = "needs-approval" | "resolved";
type GitHubSnapshotInput = Parameters<typeof evaluateGitHubSnapshot>[0];

export const FLAGSHIP_INCIDENT: GitHubIncidentContext = {
  id: "INC-2041",
  severity: "critical",
  summary:
    "Active session-token replay weakness is exploitable in production; this patch closes the replay path and rotates validation logic.",
};

export const FLAGSHIP_ACTION_ID =
  "github_vetolayer-labs_identity-api_312_deploy-production";
export const FLAGSHIP_DECISION_ID = `decision_${FLAGSHIP_ACTION_ID}`;
export const FLAGSHIP_REVIEW_CASE_ID = `review_${FLAGSHIP_DECISION_ID}`;

const baseSnapshot: Omit<GitHubPullRequestSnapshot, "reviews"> = {
  owner: "vetolayer-labs",
  repo: "identity-api",
  number: 312,
  title: "Patch session-token replay vulnerability",
  url: "https://github.com/vetolayer-labs/identity-api/pull/312",
  headSha: "secfix-312-a91f",
  baseBranch: "main",
  draft: false,
  merged: false,
  changedFiles: [
    { filename: "src/auth/session.ts", status: "modified", additions: 34, deletions: 12 },
    { filename: "src/security/token-validation.ts", status: "modified", additions: 18, deletions: 3 },
  ],
  checks: [
    { name: "CI / unit", status: "completed", conclusion: "success" },
    { name: "Security / dependency-scan", status: "completed", conclusion: "success" },
    { name: "Security / auth-regression", status: "completed", conclusion: "success" },
  ],
};

export function flagshipSnapshot(stage: DemoStage): GitHubPullRequestSnapshot {
  return {
    ...baseSnapshot,
    reviews:
      stage === "resolved"
        ? [
            {
              user: "security-lead",
              state: "APPROVED",
              submittedAt: new Date().toISOString(),
            },
          ]
        : [],
  };
}

/**
 * Seeded public-demo human review. This is intentionally labelled as demo
 * evidence in the UI; the actual policy engine, SERV call, orchestration, and
 * receipt generation are still executed on every re-evaluation.
 */
export function createFlagshipDemoHumanReview(
  now: Date = new Date(),
): HumanReviewRecord {
  return {
    id: `demo-security-review_${now.getTime()}`,
    decisionId: FLAGSHIP_DECISION_ID,
    reviewer: {
      id: "security-lead",
      kind: "human",
      name: "Security Lead",
      metadata: { identitySource: "seeded-demo-review" },
    },
    action: "approve",
    rationale:
      "Approved for critical security remediation after reviewing the active incident and passing CI/security evidence.",
    requestedEvidence: [],
    submittedAt: now.toISOString(),
  };
}

export async function runFlagshipDemo(
  stage: DemoStage,
  options: {
    servConfig?: GitHubSnapshotInput["servConfig"];
    servFetch?: typeof fetch;
    now?: Date;
    humanReview?: HumanReviewRecord;
  } = {},
) {
  return evaluateGitHubSnapshot({
    snapshot: flagshipSnapshot(stage),
    operation: "deploy-production",
    restrictedWindow: true,
    incident: FLAGSHIP_INCIDENT,
    ...(options.humanReview ? { humanReview: options.humanReview } : {}),
    ...(options.servConfig ? { servConfig: options.servConfig } : {}),
    ...(options.servFetch ? { servFetch: options.servFetch } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}

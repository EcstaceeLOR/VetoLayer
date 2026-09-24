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

import type { ActionRequest, Evidence, JsonValue } from "@vetolayer/core";
import type { GitHubPullRequestSnapshot } from "./github-client";

export type GitHubGateOperation =
  | "merge-pull-request"
  | "deploy-production"
  | "modify-protected-configuration"
  | "security-sensitive-change";

export type GitHubGateBundle = {
  action: ActionRequest;
  evidence: Evidence[];
  facts: Record<string, JsonValue>;
  environment: Record<string, unknown>;
};

const SENSITIVE_PATH_PATTERNS = [
  /(^|\/)auth(\/|$)/i,
  /(^|\/)security(\/|$)/i,
  /(^|\/)middleware(\/|$)/i,
  /(^|\/)infra(\/|$)/i,
  /(^|\/)\.github\/workflows(\/|$)/i,
  /(^|\/)(secrets?|permissions?)(\.|\/|$)/i,
];

export function buildGitHubGateBundle(input: {
  snapshot: GitHubPullRequestSnapshot;
  operation?: GitHubGateOperation;
  requestedAt?: Date;
  restrictedWindow?: boolean;
}): GitHubGateBundle {
  const operation = input.operation ?? "merge-pull-request";
  const requestedAt = input.requestedAt ?? new Date();
  const approvals = latestApprovedReviewers(input.snapshot);
  const failingChecks = input.snapshot.checks.filter(
    (check) => check.status !== "completed" || check.conclusion !== "success",
  );
  const sensitiveFiles = input.snapshot.changedFiles
    .map((file) => file.filename)
    .filter(isSensitivePath);

  const evidence: Evidence[] = [
    {
      id: `github-pr-${input.snapshot.number}`,
      type: "pull-request",
      source: { kind: "github-api", label: "Pull request metadata", uri: input.snapshot.url },
      data: {
        title: input.snapshot.title,
        headSha: input.snapshot.headSha,
        baseBranch: input.snapshot.baseBranch,
        draft: input.snapshot.draft,
        merged: input.snapshot.merged,
      },
      observedAt: requestedAt.toISOString(),
      verification: { status: "verified", verifier: "github-api" },
    },
    {
      id: `github-checks-${input.snapshot.headSha}`,
      type: "ci-status",
      source: { kind: "github-check-runs", label: "Commit check runs" },
      data: {
        passed: input.snapshot.checks.length > 0 && failingChecks.length === 0,
        total: input.snapshot.checks.length,
        failing: failingChecks.map((check) => check.name),
      },
      observedAt: requestedAt.toISOString(),
      verification: { status: "verified", verifier: "github-api" },
    },
    {
      id: `github-reviews-${input.snapshot.number}`,
      type: "review-approval",
      source: { kind: "github-reviews", label: "Pull request reviews" },
      data: { count: approvals.length, approvers: approvals },
      observedAt: requestedAt.toISOString(),
      verification: { status: "verified", verifier: "github-api" },
    },
    {
      id: `github-files-${input.snapshot.number}`,
      type: "changed-files",
      source: { kind: "github-files", label: "Pull request changed files" },
      data: {
        files: input.snapshot.changedFiles.map((file) => file.filename),
        sensitiveFiles,
      },
      observedAt: requestedAt.toISOString(),
      verification: { status: "verified", verifier: "github-api" },
    },
  ];

  return {
    action: {
      id: `github_${input.snapshot.owner}_${input.snapshot.repo}_${input.snapshot.number}_${operation}`,
      actor: {
        id: "coding-agent",
        kind: "agent",
        name: "Autonomous Coding Agent",
        framework: "github",
      },
      action: {
        type: "source-control",
        tool: "github",
        operation,
        arguments: {
          owner: input.snapshot.owner,
          repository: input.snapshot.repo,
          pullRequest: input.snapshot.number,
          headSha: input.snapshot.headSha,
          baseBranch: input.snapshot.baseBranch,
        },
      },
      target: {
        type: operation === "deploy-production" ? "environment" : "repository",
        id: `${input.snapshot.owner}/${input.snapshot.repo}`,
        environment: operation === "deploy-production" ? "production" : input.snapshot.baseBranch,
      },
      context: {
        source: "github-gate",
        environment: operation === "deploy-production" ? "production" : input.snapshot.baseBranch,
        attributes: {
          pullRequestUrl: input.snapshot.url,
          sensitiveChange: sensitiveFiles.length > 0,
          restrictedWindow: input.restrictedWindow ?? false,
        },
      },
      requestedAt: requestedAt.toISOString(),
    },
    evidence,
    facts: {
      isDraft: input.snapshot.draft,
      alreadyMerged: input.snapshot.merged,
      approvalCount: approvals.length,
      ciPassed: input.snapshot.checks.length > 0 && failingChecks.length === 0,
      changedFileCount: input.snapshot.changedFiles.length,
      sensitiveChange: sensitiveFiles.length > 0,
      restrictedWindow: input.restrictedWindow ?? false,
    },
    environment: {
      repository: `${input.snapshot.owner}/${input.snapshot.repo}`,
      baseBranch: input.snapshot.baseBranch,
      sensitiveFiles,
      restrictedWindow: input.restrictedWindow ?? false,
    },
  };
}

function latestApprovedReviewers(snapshot: GitHubPullRequestSnapshot): string[] {
  const latest = new Map<string, string>();
  for (const review of snapshot.reviews) latest.set(review.user, review.state.toUpperCase());
  return [...latest.entries()]
    .filter(([, state]) => state === "APPROVED")
    .map(([user]) => user);
}

function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

import {
  createDecisionReceipt,
  evaluateAction,
  type DecisionOrchestrationResult,
  type DecisionReceipt,
  type HumanReviewRecord,
  type Policy,
} from "@vetolayer/core";
import { evaluateDeterministicPolicies } from "@vetolayer/policies";
import {
  evaluateWithServ,
  readServEnvironment,
  type ServClientConfig,
} from "@vetolayer/serv";
import {
  buildGitHubGateBundle,
  type GitHubGateOperation,
  type GitHubIncidentContext,
} from "./adapter";
import {
  createGitHubEvidenceClient,
  type GitHubPullRequestSnapshot,
} from "./github-client";
import { githubGatePolicies } from "./policies";

export type GitHubGateResult = {
  snapshot: GitHubPullRequestSnapshot;
  orchestration: DecisionOrchestrationResult;
  receipt: DecisionReceipt;
};

export async function evaluateGitHubSnapshot(input: {
  snapshot: GitHubPullRequestSnapshot;
  operation?: GitHubGateOperation;
  policies?: Policy[];
  servConfig?: ServClientConfig;
  servFetch?: typeof fetch;
  now?: Date;
  restrictedWindow?: boolean;
  incident?: GitHubIncidentContext;
  humanReview?: HumanReviewRecord;
}): Promise<GitHubGateResult> {
  const now = input.now ?? new Date();
  const bundle = buildGitHubGateBundle({
    snapshot: input.snapshot,
    ...(input.operation ? { operation: input.operation } : {}),
    requestedAt: now,
    ...(input.restrictedWindow !== undefined
      ? { restrictedWindow: input.restrictedWindow }
      : {}),
    ...(input.incident ? { incident: input.incident } : {}),
    ...(input.humanReview ? { humanReview: input.humanReview } : {}),
  });
  const policies = input.policies ?? githubGatePolicies;

  const orchestration = await evaluateAction(
    {
      action: bundle.action,
      policies,
      evidence: bundle.evidence,
      facts: bundle.facts,
      environment: bundle.environment,
      now,
      decisionId: `decision_${bundle.action.id}`,
    },
    {
      evaluateDeterministic: (deterministicInput) =>
        evaluateDeterministicPolicies(deterministicInput),
      evaluateContextual: (contextualInput) => {
        const servConfig = input.servConfig ?? readServEnvironment();
        return input.servFetch
          ? evaluateWithServ(contextualInput, servConfig, input.servFetch)
          : evaluateWithServ(contextualInput, servConfig);
      },
    },
  );

  const receipt = await createDecisionReceipt({
    orchestration,
    action: bundle.action,
    policies,
    evidence: bundle.evidence,
    createdAt: now,
    receiptId: `receipt_${bundle.action.id}`,
  });

  return { snapshot: input.snapshot, orchestration, receipt };
}

export async function evaluateGitHubPullRequest(input: {
  owner: string;
  repo: string;
  pullRequest: number;
  githubToken: string;
  operation?: GitHubGateOperation;
  policies?: Policy[];
  servConfig?: ServClientConfig;
  githubFetch?: typeof fetch;
  servFetch?: typeof fetch;
  now?: Date;
  restrictedWindow?: boolean;
  incident?: GitHubIncidentContext;
  humanReview?: HumanReviewRecord;
}): Promise<GitHubGateResult> {
  const client = input.githubFetch
    ? createGitHubEvidenceClient({ token: input.githubToken }, input.githubFetch)
    : createGitHubEvidenceClient({ token: input.githubToken });

  const snapshot = await client.collectPullRequest(
    input.owner,
    input.repo,
    input.pullRequest,
  );

  return evaluateGitHubSnapshot({
    snapshot,
    ...(input.operation ? { operation: input.operation } : {}),
    ...(input.policies ? { policies: input.policies } : {}),
    ...(input.servConfig ? { servConfig: input.servConfig } : {}),
    ...(input.servFetch ? { servFetch: input.servFetch } : {}),
    ...(input.now ? { now: input.now } : {}),
    ...(input.restrictedWindow !== undefined
      ? { restrictedWindow: input.restrictedWindow }
      : {}),
    ...(input.incident ? { incident: input.incident } : {}),
    ...(input.humanReview ? { humanReview: input.humanReview } : {}),
  });
}

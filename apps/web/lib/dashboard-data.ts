import type { DecisionReceipt } from "@vetolayer/core";

export type DashboardDecision = DecisionReceipt & {
  display: {
    title: string;
    repository: string;
    relativeTime: string;
  };
};

const base = {
  schemaVersion: "1.0.0" as const,
  actor: {
    id: "coding-agent",
    kind: "agent" as const,
    name: "Autonomous Coding Agent",
    framework: "github",
  },
  policiesEvaluated: [],
  contradictoryEvidence: [],
  exceptionPath: [],
  versions: { receiptSchema: "1.0.0" as const, orchestrator: "1.0.0" as const },
  integrity: { algorithm: "SHA-256" as const, hash: "8d7bc97c02b8b77c707ddb1a3b83f7b3cbf3f6aeeaaf259bf3bb40a88577c441" },
};

export const dashboardDecisions: DashboardDecision[] = [
  {
    ...base,
    receiptId: "receipt_github_acme_api_42_merge",
    decisionId: "decision_github_acme_api_42_merge",
    action: {
      requestId: "github_acme_api_42_merge-pull-request",
      type: "source-control",
      tool: "github",
      operation: "merge-pull-request",
      targetType: "repository",
      targetId: "acme/api",
      environment: "main",
    },
    outcome: "ALLOW",
    decisionSummary: "Required checks and review evidence are present; contextual policy permits the action.",
    deterministicFindings: [
      { id: "ci:1", policyId: "github-ci-must-pass", source: "deterministic", status: "pass", severity: "critical", summary: "CI checks are successful.", evidenceIds: ["ev-ci-42"] },
      { id: "review:1", policyId: "github-review-required", source: "deterministic", status: "pass", severity: "high", summary: "Human approval is present.", evidenceIds: ["ev-review-42"] },
    ],
    contextualFindings: [
      { id: "serv:1", policyId: "github-sensitive-change-context", source: "contextual", status: "pass", severity: "critical", summary: "SERV found the authentication change sufficiently evidenced for this action.", evidenceIds: ["ev-files-42", "ev-ci-42", "ev-review-42"] },
    ],
    evidenceUsed: [],
    missingEvidence: [],
    requirementsToChangeOutcome: [],
    timestamps: { requestedAt: "2026-09-24T13:55:00.000Z", decidedAt: "2026-09-24T13:55:02.000Z", receiptCreatedAt: "2026-09-24T13:55:02.000Z" },
    trace: [
      { step: "policy-resolution", status: "completed", summary: "Four policies resolved." },
      { step: "deterministic-evaluation", status: "completed", summary: "Hard policy checks passed." },
      { step: "contextual-evaluation", status: "completed", summary: "SERV returned ALLOW." },
      { step: "decision-combination", status: "completed", summary: "Final outcome is ALLOW." },
    ],
    providerTrace: { provider: "openserv-serv", providerStatus: "ok", requestId: "serv-42", model: "SERV Reasoning" },
    display: { title: "Merge PR #42 — auth hardening", repository: "acme/api", relativeTime: "2 min ago" },
  },
  {
    ...base,
    receiptId: "receipt_github_northstar_web_118_deploy",
    decisionId: "decision_github_northstar_web_118_deploy",
    action: {
      requestId: "github_northstar_web_118_deploy-production",
      type: "source-control",
      tool: "github",
      operation: "deploy-production",
      targetType: "environment",
      targetId: "northstar/web",
      environment: "production",
    },
    outcome: "REVIEW",
    decisionSummary: "The action is technically healthy but lacks the required current human approval.",
    deterministicFindings: [
      { id: "review:118", policyId: "github-review-required", source: "deterministic", status: "uncertain", severity: "high", summary: "No current approving human review was found.", evidenceIds: ["ev-review-118"] },
    ],
    contextualFindings: [
      { id: "serv:118", policyId: "github-sensitive-change-context", source: "contextual", status: "pass", severity: "critical", summary: "SERV found no contextual reason to block, subject to required approval.", evidenceIds: ["ev-files-118", "ev-ci-118"] },
    ],
    evidenceUsed: [],
    missingEvidence: [],
    requirementsToChangeOutcome: ["Resolve policy github-review-required: No current approving human review was found."],
    timestamps: { requestedAt: "2026-09-24T13:41:00.000Z", decidedAt: "2026-09-24T13:41:03.000Z", receiptCreatedAt: "2026-09-24T13:41:03.000Z" },
    trace: [
      { step: "policy-resolution", status: "completed", summary: "Four policies resolved." },
      { step: "deterministic-evaluation", status: "completed", summary: "Approval policy requires REVIEW." },
      { step: "contextual-evaluation", status: "completed", summary: "SERV returned ALLOW." },
      { step: "decision-combination", status: "completed", summary: "Final outcome remains REVIEW." },
    ],
    providerTrace: { provider: "openserv-serv", providerStatus: "ok", requestId: "serv-118", model: "SERV Reasoning" },
    display: { title: "Deploy PR #118 — production", repository: "northstar/web", relativeTime: "16 min ago" },
  },
  {
    ...base,
    receiptId: "receipt_github_vector_core_9_merge",
    decisionId: "decision_github_vector_core_9_merge",
    action: {
      requestId: "github_vector_core_9_merge-pull-request",
      type: "source-control",
      tool: "github",
      operation: "merge-pull-request",
      targetType: "repository",
      targetId: "vector/core",
      environment: "main",
    },
    outcome: "BLOCK",
    decisionSummary: "The pull request is still a draft, so autonomous execution is prohibited.",
    deterministicFindings: [
      { id: "draft:9", policyId: "github-no-draft-actions", source: "deterministic", status: "fail", severity: "critical", summary: "Draft pull requests cannot be autonomously merged or deployed.", evidenceIds: ["ev-pr-9"] },
    ],
    contextualFindings: [],
    evidenceUsed: [],
    missingEvidence: [],
    requirementsToChangeOutcome: ["Resolve policy github-no-draft-actions: Draft pull requests cannot be autonomously merged or deployed."],
    timestamps: { requestedAt: "2026-09-24T13:20:00.000Z", decidedAt: "2026-09-24T13:20:00.200Z", receiptCreatedAt: "2026-09-24T13:20:00.200Z" },
    trace: [
      { step: "policy-resolution", status: "completed", summary: "Four policies resolved." },
      { step: "deterministic-evaluation", status: "completed", summary: "A hard BLOCK matched." },
      { step: "contextual-evaluation", status: "skipped", summary: "SERV was skipped because a hard BLOCK already applies." },
      { step: "decision-combination", status: "completed", summary: "Final outcome is BLOCK." },
    ],
    display: { title: "Merge PR #9 — billing refactor", repository: "vector/core", relativeTime: "37 min ago" },
  },
];

export function getDecision(id: string) {
  return dashboardDecisions.find((decision) => decision.decisionId === id);
}

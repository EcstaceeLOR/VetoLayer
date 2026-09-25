import { randomUUID } from "node:crypto";
import {
  createDecisionReceipt,
  evaluateAction,
  humanReviewToEvidence,
  type Actor,
  type HumanReviewRecord,
} from "@vetolayer/core";
import { buildGitHubGateBundle, githubGatePolicies } from "@vetolayer/github-gate";
import { evaluateDeterministicPolicies } from "@vetolayer/policies";
import { evaluateWithServ, readServEnvironment } from "@vetolayer/serv";
import type { ProductScope } from "../workspace-model";
import { getDeveloperStore } from "./developer-store";
import { deliverDeveloperWebhook } from "./developer-webhooks";
import { mergeManagedPolicies } from "./managed-policies";
import type { ReviewCase, ReviewTimelineEvent, ReviewTimelineEventType } from "./review-store";

export function reviewActor(input: { userId: string; displayName?: string; email?: string; role?: string }): Actor {
  return {
    id: input.userId,
    kind: "human",
    name: input.displayName ?? input.email ?? "Workspace reviewer",
    metadata: {
      identitySource: "supabase-auth",
      ...(input.role ? { workspaceRole: input.role } : {}),
      ...(input.email ? { email: input.email } : {}),
    },
  };
}

export function reviewEvent(input: {
  reviewCaseId: string;
  type: ReviewTimelineEventType;
  summary: string;
  createdAt?: string;
  actor?: Actor;
  receiptId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): ReviewTimelineEvent {
  return {
    id: `rev_evt_${randomUUID()}`,
    type: input.type,
    summary: input.summary,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.actor ? { actor: input.actor } : {}),
    ...(input.receiptId ? { receiptId: input.receiptId } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export async function reevaluateReviewCase(input: {
  reviewCase: ReviewCase;
  scope: ProductScope;
  receiptScope: {
    workspaceId: string;
    projectId: string;
    environmentId: string;
    workspaceName?: string;
    projectName?: string;
    environmentName?: string;
  };
  humanReview?: HumanReviewRecord;
  reason: "evidence-change" | "approval" | "rejection";
}) {
  if (input.reviewCase.context.kind !== "github") throw new Error("Unsupported review context");
  const now = new Date();
  const bundle = buildGitHubGateBundle({
    snapshot: input.reviewCase.context.snapshot,
    operation: input.reviewCase.context.operation,
    restrictedWindow: input.reviewCase.context.restrictedWindow,
    ...(input.reviewCase.context.incident ? { incident: input.reviewCase.context.incident } : {}),
    ...(input.humanReview ? { humanReview: input.humanReview } : {}),
    requestedAt: now,
  });
  const reviewEvidence = input.reviewCase.reviewHistory.map(humanReviewToEvidence);
  if (input.humanReview && !input.reviewCase.reviewHistory.some((item) => item.id === input.humanReview?.id)) {
    reviewEvidence.push(humanReviewToEvidence(input.humanReview));
  }
  const addedEvidence = input.reviewCase.evidenceAdditions.map((item) => item.evidence);
  const evidence = dedupeEvidence([...bundle.evidence, ...reviewEvidence, ...addedEvidence]);
  const policySet = await mergeManagedPolicies(input.scope, githubGatePolicies, { preserveTrustedFallback: true });
  const orchestration = await evaluateAction({
    action: bundle.action,
    policies: policySet.policies,
    evidence,
    facts: bundle.facts,
    environment: bundle.environment,
    now,
    decisionId: `decision_${bundle.action.id}_${now.getTime()}`,
  }, {
    evaluateDeterministic: (evaluation) => evaluateDeterministicPolicies(evaluation),
    evaluateContextual: (evaluation) => evaluateWithServ(evaluation, readServEnvironment()),
  });
  const parentReceipt = input.reviewCase.resolutionReceipt ?? input.reviewCase.receipt;
  const receipt = await createDecisionReceipt({
    orchestration,
    action: bundle.action,
    policies: policySet.policies,
    evidence,
    createdAt: now,
    receiptId: `receipt_${bundle.action.id}_${randomUUID()}`,
    scope: input.receiptScope,
  });
  return {
    orchestration,
    receipt,
    parentReceiptId: parentReceipt.receiptId,
    managedPolicyVersions: policySet.managedVersions.map((version) => ({ policyId: version.policyId, version: version.version, versionId: version.id })),
  };
}

export async function emitReviewWebhook(input: {
  scope: ProductScope;
  eventType: "review.created" | "review.updated" | "review.resolved";
  reviewCase: ReviewCase;
  action?: string;
}) {
  try {
    const { store } = getDeveloperStore();
    const endpoints = await store.listWebhooks(input.scope);
    const active = endpoints.filter((endpoint) => endpoint.status === "active" && endpoint.events.includes(input.eventType));
    await Promise.allSettled(active.map((endpoint) => deliverDeveloperWebhook({
      store,
      endpoint,
      scope: input.scope,
      eventType: input.eventType,
      payload: {
        reviewCaseId: input.reviewCase.id,
        status: input.reviewCase.status,
        revision: input.reviewCase.revision,
        assigneeUserId: input.reviewCase.assignment?.userId ?? null,
        latestReceiptId: input.reviewCase.resolutionReceipt?.receiptId ?? input.reviewCase.receipt.receiptId,
        ...(input.action ? { action: input.action } : {}),
      },
    })));
  } catch {
    // Review mutation success must not depend on an optional outbound webhook.
  }
}

function dedupeEvidence<T extends { id: string }>(items: T[]) {
  const byId = new Map<string, T>();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()];
}

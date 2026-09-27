import { randomUUID } from "node:crypto";
import { after } from "next/server";
import {
  createDecisionReceipt,
  evaluateAction,
  humanReviewToEvidence,
  type Actor,
  type Evidence,
  type HumanReviewRecord,
  type JsonValue,
  type Policy,
} from "@vetolayer/core";
import { buildGitHubGateBundle, githubGatePolicies } from "@vetolayer/github-gate";
import { evaluateDeterministicPolicies } from "@vetolayer/policies";
import { evaluateWithServ, readServEnvironment } from "@vetolayer/serv";
import type { ProductScope } from "../workspace-model";
import { getDecisionStore } from "./decision-store";
import { getDeveloperStore } from "./developer-store";
import { deliverDeveloperWebhook } from "./developer-webhooks";
import { mergeManagedPolicies } from "./managed-policies";
import { logServerEvent } from "./observability";
import { emitProductEvent, type ProductEventInput } from "./product-events";
import { getReviewStore, type ReviewCase, type ReviewTimelineEvent, type ReviewTimelineEventType } from "./review-store";

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

export async function createGenericReviewCase(input: {
  scope: ProductScope;
  receipt: import("@vetolayer/core").DecisionReceipt;
  action: import("@vetolayer/core").ActionRequest;
  evidence: Evidence[];
  facts: Record<string, JsonValue>;
  policies: Policy[];
  source: "api" | "integration";
  title: string;
}) {
  const now = new Date().toISOString();
  const reviewCaseId = `review_${input.receipt.receiptId}`;
  const { store } = getReviewStore();
  const saved = await store.save({
    id: reviewCaseId,
    ...input.scope,
    revision: 1,
    status: "pending",
    title: input.title,
    source: input.source,
    receipt: input.receipt,
    context: { kind: "generic", action: input.action, evidence: input.evidence, facts: input.facts, policies: input.policies },
    createdAt: now,
    updatedAt: now,
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    comments: [],
    evidenceAdditions: [],
    reviewHistory: [],
    timeline: [reviewEvent({ reviewCaseId, type: "created", summary: "Review case created from a REVIEW decision.", createdAt: now, receiptId: input.receipt.receiptId })],
    receiptLineage: [{ receiptId: input.receipt.receiptId, outcome: input.receipt.outcome, createdAt: input.receipt.timestamps.receiptCreatedAt, reason: "initial" }],
  });
  await syncReviewDecisionIndex(saved);
  await emitReviewWebhook({ scope: input.scope, eventType: "review.created", reviewCase: saved, action: "created" });
  return saved;
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
  const now = new Date();
  if (input.reviewCase.context.kind === "generic") {
    const context = input.reviewCase.context;
    const reviewEvidence = input.reviewCase.reviewHistory.map(humanReviewToEvidence);
    if (input.humanReview && !input.reviewCase.reviewHistory.some((item) => item.id === input.humanReview?.id)) reviewEvidence.push(humanReviewToEvidence(input.humanReview));
    const addedEvidence = input.reviewCase.evidenceAdditions.map((item) => item.evidence);
    const evidence = dedupeEvidence([...context.evidence, ...reviewEvidence, ...addedEvidence]);
    const orchestration = await evaluateAction({
      action: context.action,
      policies: context.policies,
      evidence,
      facts: context.facts,
      environment: input.scope,
      now,
      decisionId: `decision_${context.action.id}_${now.getTime()}`,
    }, {
      evaluateDeterministic: (evaluation) => evaluateDeterministicPolicies(evaluation),
      evaluateContextual: (evaluation) => evaluateWithServ(evaluation, readServEnvironment()),
    });
    const receipt = await createDecisionReceipt({
      orchestration,
      action: context.action,
      policies: context.policies,
      evidence,
      createdAt: now,
      receiptId: `receipt_${context.action.id}_${now.getTime()}`,
      scope: input.receiptScope,
    });
    return { orchestration, receipt, parentReceiptId: (input.reviewCase.resolutionReceipt ?? input.reviewCase.receipt).receiptId, managedPolicyVersions: [] };
  }
  const bundle = buildGitHubGateBundle({
    snapshot: input.reviewCase.context.snapshot,
    operation: input.reviewCase.context.operation,
    restrictedWindow: input.reviewCase.context.restrictedWindow,
    ...(input.reviewCase.context.incident ? { incident: input.reviewCase.context.incident } : {}),
    ...(input.humanReview ? { humanReview: input.humanReview } : {}),
    requestedAt: now,
  });
  const reviewEvidence = input.reviewCase.reviewHistory.map(humanReviewToEvidence);
  if (input.humanReview && !input.reviewCase.reviewHistory.some((item) => item.id === input.humanReview?.id)) reviewEvidence.push(humanReviewToEvidence(input.humanReview));
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

export async function syncReviewDecisionIndex(reviewCase: ReviewCase) {
  const receiptIds = [...new Set(reviewCase.receiptLineage.map((entry) => entry.receiptId))];
  try {
    const { store } = getDecisionStore();
    await store.annotateReview(reviewCase.workspaceId, receiptIds, { state: reviewCase.status, reviewCaseId: reviewCase.id });
  } catch (error) {
    logServerEvent("warn", "review.decision_index.failed", { reviewCaseId: reviewCase.id, workspaceId: reviewCase.workspaceId, status: reviewCase.status, receiptCount: receiptIds.length, message: error instanceof Error ? error.message : "Decision review index update failed" });
  }
}

export async function emitReviewWebhook(input: {
  scope: ProductScope;
  eventType: "review.created" | "review.updated" | "review.resolved";
  reviewCase: ReviewCase;
  action?: string;
}) {
  const latestReceiptId = input.reviewCase.resolutionReceipt?.receiptId ?? input.reviewCase.receipt.receiptId;
  const common = {
    ...input.scope,
    href: `/dashboard/reviews?case=${encodeURIComponent(input.reviewCase.id)}`,
    data: {
      reviewCaseId: input.reviewCase.id,
      status: input.reviewCase.status,
      revision: input.reviewCase.revision,
      assigneeUserId: input.reviewCase.assignment?.userId ?? null,
      latestReceiptId,
      ...(input.action ? { action: input.action } : {}),
    },
  };

  if (input.eventType === "review.created") {
    await safelyEmitReviewProductEvent(input.reviewCase.id, { ...common, idempotencyKey: `review:${input.reviewCase.id}:created`, type: "review.created", severity: "warning", title: "Review required", message: input.reviewCase.title });
    return;
  }
  if (input.eventType === "review.resolved") {
    await safelyEmitReviewProductEvent(input.reviewCase.id, { ...common, idempotencyKey: `review:${input.reviewCase.id}:${input.reviewCase.revision}:resolved`, type: "review.resolved", severity: "info", title: "Review resolved", message: `${input.reviewCase.title} is resolved.`, ...(input.reviewCase.assignment?.userId ? { recipientUserIds: [input.reviewCase.assignment.userId] } : {}) });
    return;
  }
  if (input.action === "assign") {
    await safelyEmitReviewProductEvent(input.reviewCase.id, { ...common, idempotencyKey: `review:${input.reviewCase.id}:${input.reviewCase.revision}:assigned`, type: "review.assigned", severity: "warning", title: "Review assigned", message: `You were assigned ${input.reviewCase.title}.`, ...(input.reviewCase.assignment?.userId ? { recipientUserIds: [input.reviewCase.assignment.userId] } : {}) });
    return;
  }
  if (input.action === "request_evidence") {
    await safelyEmitReviewProductEvent(input.reviewCase.id, { ...common, idempotencyKey: `review:${input.reviewCase.id}:${input.reviewCase.revision}:evidence-requested`, type: "review.evidence_requested", severity: "warning", title: "Evidence requested", message: `${input.reviewCase.title} needs additional evidence.`, ...(input.reviewCase.assignment?.userId ? { recipientUserIds: [input.reviewCase.assignment.userId] } : {}) });
    return;
  }

  try {
    after(async () => {
      try {
        const { store } = getDeveloperStore();
        const endpoints = (await store.listWebhooks(input.scope)).filter((endpoint) => endpoint.status === "active" && endpoint.events.includes("review.updated"));
        await Promise.allSettled(endpoints.map((endpoint) => deliverDeveloperWebhook({ store, endpoint, scope: input.scope, eventType: "review.updated", payload: common.data })));
      } catch (error) {
        logServerEvent("warn", "review.webhook.background_failed", { reviewCaseId: input.reviewCase.id, message: error instanceof Error ? error.message : "Review webhook failed" });
      }
    });
  } catch {
    // The authoritative review mutation is already durable; webhook work stays optional.
  }
}

async function safelyEmitReviewProductEvent(reviewCaseId: string, event: ProductEventInput) {
  try {
    await emitProductEvent(event);
  } catch (error) {
    logServerEvent("warn", "review.notification.emit_failed", {
      reviewCaseId,
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      environmentId: event.environmentId,
      eventType: event.type,
      message: error instanceof Error ? error.message : "Review notification could not be queued",
    });
  }
}

function dedupeEvidence<T extends { id: string }>(items: T[]) {
  const byId = new Map<string, T>();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()];
}

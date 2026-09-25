import { randomUUID } from "node:crypto";
import { EvidenceSchema, HumanReviewRecordSchema, type HumanReviewRecord } from "@vetolayer/core";
import { NextResponse } from "next/server";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../../lib/server/api-auth";
import { getOptionalDecisionStore } from "../../../../../lib/server/decision-store";
import { logServerEvent } from "../../../../../lib/server/observability";
import { ReviewConflictError, getReviewStore, type ReviewCase } from "../../../../../lib/server/review-store";
import { emitReviewWebhook, reevaluateReviewCase, reviewActor, reviewEvent } from "../../../../../lib/server/review-workflow";
import { getWorkspaceStore } from "../../../../../lib/server/workspace-store";

export const runtime = "nodejs";

type ReviewMutationBody = {
  action?: string;
  expectedRevision?: number;
  assigneeUserId?: string;
  comment?: string;
  rationale?: string;
  requestedEvidence?: string[];
  evidenceType?: string;
  evidenceLabel?: string;
  evidenceReference?: string;
  evidenceNote?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiWorkspace("reviews.resolve");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  const { id } = await context.params;
  const scope = { workspaceId: auth.workspace.workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId };
  const { store, persistence } = getReviewStore();
  const reviewCase = await store.get(scope.workspaceId, id);
  if (!reviewCase || (reviewCase.projectId && reviewCase.projectId !== scope.projectId) || (reviewCase.environmentId && reviewCase.environmentId !== scope.environmentId)) {
    return NextResponse.json({ error: "REVIEW_CASE_NOT_FOUND" }, { status: 404 });
  }

  let body: ReviewMutationBody;
  try { body = await request.json() as ReviewMutationBody; } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (!Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) {
    return NextResponse.json({ error: "REVISION_REQUIRED", message: "Send the review revision you loaded so concurrent changes cannot be overwritten." }, { status: 400 });
  }
  const expectedRevision = Number(body.expectedRevision);
  const actor = reviewActor({ userId: auth.workspace.userId, displayName: auth.workspace.displayName, email: auth.workspace.email, role: auth.workspace.role });
  const now = new Date().toISOString();

  try {
    switch (body.action) {
      case "assign": {
        if (!body.assigneeUserId) return NextResponse.json({ error: "ASSIGNEE_REQUIRED" }, { status: 400 });
        const { store: workspaceStore } = getWorkspaceStore();
        const member = await workspaceStore.getMembership(scope.workspaceId, body.assigneeUserId);
        if (!member || !["owner", "admin", "reviewer"].includes(member.role)) {
          return NextResponse.json({ error: "INVALID_ASSIGNEE", message: "Assign reviews only to an active owner, admin, or reviewer." }, { status: 400 });
        }
        const next: ReviewCase = {
          ...reviewCase,
          assignment: {
            userId: member.userId,
            ...(member.displayName ? { displayName: member.displayName } : {}),
            ...(member.email ? { email: member.email } : {}),
            assignedByUserId: auth.workspace.userId,
            assignedAt: now,
          },
          timeline: [...reviewCase.timeline, reviewEvent({ reviewCaseId: id, type: "assigned", actor, summary: `Assigned to ${member.displayName ?? member.email ?? member.userId}.`, createdAt: now, metadata: { assigneeUserId: member.userId } })],
          updatedAt: now,
        };
        return await saveMutation(next, expectedRevision, scope, persistence, "assign");
      }
      case "unassign": {
        const next: ReviewCase = {
          ...reviewCase,
          assignment: undefined,
          timeline: [...reviewCase.timeline, reviewEvent({ reviewCaseId: id, type: "unassigned", actor, summary: "Review assignment cleared.", createdAt: now })],
          updatedAt: now,
        };
        return await saveMutation(next, expectedRevision, scope, persistence, "unassign");
      }
      case "comment": {
        const comment = body.comment?.trim();
        if (!comment || comment.length > 4_000) return NextResponse.json({ error: "INVALID_COMMENT", message: "Comment must contain 1–4000 characters." }, { status: 400 });
        const next: ReviewCase = {
          ...reviewCase,
          comments: [...reviewCase.comments, { id: `review_comment_${randomUUID()}`, author: actor, body: comment, createdAt: now }],
          timeline: [...reviewCase.timeline, reviewEvent({ reviewCaseId: id, type: "commented", actor, summary: "Internal review note added.", createdAt: now })],
          updatedAt: now,
        };
        return await saveMutation(next, expectedRevision, scope, persistence, "comment");
      }
      case "request_evidence": {
        if (reviewCase.status === "resolved") return alreadyResolved(reviewCase);
        const requestedEvidence = (body.requestedEvidence ?? []).map((item) => item.trim()).filter(Boolean);
        const parsedReview = buildReviewRecord(reviewCase, actor, "request_evidence", body.rationale, requestedEvidence, now);
        if (!parsedReview.success) return NextResponse.json({ error: "INVALID_REVIEW", issues: parsedReview.error.issues }, { status: 400 });
        if (!requestedEvidence.length) return NextResponse.json({ error: "EVIDENCE_REQUEST_REQUIRED", message: "Specify at least one piece of evidence to request." }, { status: 400 });
        const next: ReviewCase = {
          ...reviewCase,
          status: "awaiting_evidence",
          review: parsedReview.data,
          reviewHistory: [...reviewCase.reviewHistory, parsedReview.data],
          timeline: [...reviewCase.timeline, reviewEvent({ reviewCaseId: id, type: "evidence_requested", actor, summary: `Requested ${requestedEvidence.length} evidence item${requestedEvidence.length === 1 ? "" : "s"}.`, createdAt: now, metadata: { count: requestedEvidence.length } })],
          updatedAt: now,
        };
        return await saveMutation(next, expectedRevision, scope, persistence, "request_evidence");
      }
      case "add_evidence": {
        if (reviewCase.status === "resolved") return alreadyResolved(reviewCase);
        const type = body.evidenceType?.trim();
        const reference = body.evidenceReference?.trim();
        if (!type || !reference) return NextResponse.json({ error: "INVALID_EVIDENCE", message: "Evidence type and evidence details are required." }, { status: 400 });
        const evidence = EvidenceSchema.safeParse({
          id: `review_evidence_${randomUUID()}`,
          type,
          source: { kind: "workspace-review", label: body.evidenceLabel?.trim() || `Reviewer supplied ${type}` },
          reference,
          observedAt: now,
          verification: { status: "unverified", details: "Supplied through the VetoLayer human review workflow." },
          metadata: { reviewCaseId: id, addedByUserId: auth.workspace.userId },
        });
        if (!evidence.success) return NextResponse.json({ error: "INVALID_EVIDENCE", issues: evidence.error.issues }, { status: 400 });
        const working: ReviewCase = {
          ...reviewCase,
          status: "pending",
          evidenceAdditions: [...reviewCase.evidenceAdditions, {
            id: `addition_${randomUUID()}`,
            evidence: evidence.data,
            addedBy: actor,
            ...(body.evidenceNote?.trim() ? { note: body.evidenceNote.trim() } : {}),
            addedAt: now,
          }],
          timeline: [...reviewCase.timeline, reviewEvent({ reviewCaseId: id, type: "evidence_added", actor, summary: `Added ${type} evidence with reviewer provenance.`, createdAt: now, metadata: { evidenceId: evidence.data.id } })],
          updatedAt: now,
        };
        return await reevaluateAndSave(working, expectedRevision, scope, auth.workspace, persistence, undefined, "evidence-change", actor);
      }
      case "approve":
      case "reject": {
        if (reviewCase.status === "resolved") return alreadyResolved(reviewCase);
        const parsedReview = buildReviewRecord(reviewCase, actor, body.action, body.rationale, [], now);
        if (!parsedReview.success) return NextResponse.json({ error: "INVALID_REVIEW", issues: parsedReview.error.issues }, { status: 400 });
        const eventType = body.action === "approve" ? "approved" : "rejected";
        const working: ReviewCase = {
          ...reviewCase,
          status: "pending",
          review: parsedReview.data,
          reviewHistory: [...reviewCase.reviewHistory, parsedReview.data],
          timeline: [...reviewCase.timeline, reviewEvent({ reviewCaseId: id, type: eventType, actor, summary: `${body.action === "approve" ? "Approval" : "Rejection"} recorded with rationale; re-evaluating through VetoLayer.`, createdAt: now })],
          updatedAt: now,
        };
        return await reevaluateAndSave(working, expectedRevision, scope, auth.workspace, persistence, parsedReview.data, body.action === "reject" ? "rejection" : "approval", actor);
      }
      default:
        return NextResponse.json({ error: "INVALID_REVIEW_ACTION", message: "Use assign, unassign, comment, request_evidence, add_evidence, approve, or reject." }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof ReviewConflictError) {
      return NextResponse.json({ error: "REVIEW_CONFLICT", message: error.message, case: error.current }, { status: 409 });
    }
    logServerEvent("error", "human_review.action.failed", { reviewCaseId: id, ...scope, action: body.action ?? "unknown", message: error instanceof Error ? error.message : "Review action failed" });
    return NextResponse.json({ error: "REVIEW_ACTION_FAILED", message: "The review action could not be completed. No action was approved." }, { status: 503 });
  }
}

function buildReviewRecord(reviewCase: ReviewCase, actor: ReturnType<typeof reviewActor>, action: "approve" | "reject" | "request_evidence", rationale: string | undefined, requestedEvidence: string[], now: string) {
  return HumanReviewRecordSchema.safeParse({
    id: `${reviewCase.id}_${Date.now()}_${randomUUID().slice(0, 8)}`,
    decisionId: (reviewCase.resolutionReceipt ?? reviewCase.receipt).decisionId,
    reviewer: actor,
    action,
    rationale,
    requestedEvidence,
    submittedAt: now,
  });
}

async function saveMutation(reviewCase: ReviewCase, expectedRevision: number, scope: { workspaceId: string; projectId: string; environmentId: string }, persistence: string, action: string) {
  const { store } = getReviewStore();
  const saved = await store.save(reviewCase, { expectedRevision });
  await emitReviewWebhook({ scope, eventType: saved.status === "resolved" ? "review.resolved" : "review.updated", reviewCase: saved, action });
  logServerEvent("info", "human_review.updated", { reviewCaseId: saved.id, ...scope, action, revision: saved.revision, status: saved.status });
  return NextResponse.json({ case: saved, persistence });
}

async function reevaluateAndSave(
  working: ReviewCase,
  expectedRevision: number,
  scope: { workspaceId: string; projectId: string; environmentId: string },
  workspace: { workspace: { name: string }; project: { name: string }; environment: { name: string } },
  persistence: string,
  humanReview: HumanReviewRecord | undefined,
  reason: "evidence-change" | "approval" | "rejection",
  actor: ReturnType<typeof reviewActor>,
) {
  const result = await reevaluateReviewCase({
    reviewCase: working,
    scope,
    receiptScope: {
      ...scope,
      workspaceName: workspace.workspace.name,
      projectName: workspace.project.name,
      environmentName: workspace.environment.name,
    },
    ...(humanReview ? { humanReview } : {}),
    reason,
  });
  const reevaluatedAt = result.receipt.timestamps.receiptCreatedAt;
  const resolved = result.receipt.outcome !== "REVIEW";
  const next: ReviewCase = {
    ...working,
    status: resolved ? "resolved" : "pending",
    resolutionReceipt: result.receipt,
    receiptLineage: [...working.receiptLineage, {
      receiptId: result.receipt.receiptId,
      parentReceiptId: result.parentReceiptId,
      outcome: result.receipt.outcome,
      createdAt: reevaluatedAt,
      reason,
    }],
    timeline: [
      ...working.timeline,
      reviewEvent({ reviewCaseId: working.id, type: "reevaluated", actor, summary: `Re-evaluation completed with ${result.receipt.outcome}.`, createdAt: reevaluatedAt, receiptId: result.receipt.receiptId, metadata: { parentReceiptId: result.parentReceiptId } }),
      ...(resolved ? [reviewEvent({ reviewCaseId: working.id, type: "resolved" as const, actor, summary: `Review resolved with ${result.receipt.outcome}.`, createdAt: reevaluatedAt, receiptId: result.receipt.receiptId })] : []),
    ],
    updatedAt: reevaluatedAt,
  };

  // Persist the immutable receipt first. A stale review update can leave an
  // unreferenced receipt, but a review must never point at a receipt that was
  // not durably written to Decision history.
  const decisionStore = getOptionalDecisionStore();
  if (decisionStore) {
    await decisionStore.save({ id: result.receipt.receiptId, ...scope, source: "integration", receipt: result.receipt, createdAt: reevaluatedAt });
  } else if (persistence === "supabase") {
    throw new Error("Decision persistence is unavailable for a durable review re-evaluation");
  }

  const { store } = getReviewStore();
  const saved = await store.save(next, { expectedRevision });
  await emitReviewWebhook({ scope, eventType: resolved ? "review.resolved" : "review.updated", reviewCase: saved, action: reason });
  logServerEvent("info", "human_review.reevaluated", { reviewCaseId: saved.id, ...scope, revision: saved.revision, resultingOutcome: result.receipt.outcome, receiptId: result.receipt.receiptId, parentReceiptId: result.parentReceiptId });
  return NextResponse.json({ case: saved, outcome: result.receipt.outcome, receipt: result.receipt, trace: result.orchestration.trace, providerTrace: result.orchestration.contextualTrace, managedPolicyVersions: result.managedPolicyVersions, persistence });
}

function alreadyResolved(reviewCase: ReviewCase) {
  return NextResponse.json({ error: "REVIEW_ALREADY_RESOLVED", case: reviewCase }, { status: 409 });
}

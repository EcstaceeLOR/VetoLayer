import { HumanReviewRecordSchema } from "@vetolayer/core";
import { evaluateGitHubSnapshot } from "@vetolayer/github-gate";
import { NextResponse } from "next/server";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../../lib/server/api-auth";
import { getOptionalDecisionStore } from "../../../../../lib/server/decision-store";
import { logServerEvent } from "../../../../../lib/server/observability";
import { getReviewStore } from "../../../../../lib/server/review-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiWorkspace("reviews.resolve");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  const { id } = await context.params;
  const workspaceId = auth.workspace.workspaceId;
  const { store, persistence } = getReviewStore();
  const reviewCase = await store.get(workspaceId, id);

  if (!reviewCase) return NextResponse.json({ error: "REVIEW_CASE_NOT_FOUND" }, { status: 404 });
  if (reviewCase.projectId && reviewCase.projectId !== auth.workspace.projectId) return NextResponse.json({ error: "REVIEW_CASE_NOT_FOUND" }, { status: 404 });
  if (reviewCase.environmentId && reviewCase.environmentId !== auth.workspace.environmentId) return NextResponse.json({ error: "REVIEW_CASE_NOT_FOUND" }, { status: 404 });
  if (reviewCase.status === "resolved") return NextResponse.json({ error: "REVIEW_ALREADY_RESOLVED", case: reviewCase }, { status: 409 });
  if (reviewCase.receipt.outcome !== "REVIEW") return NextResponse.json({ error: "NOT_REVIEWABLE", message: "Only REVIEW decisions can enter the human review loop." }, { status: 409 });

  let body: { action?: string; rationale?: string; requestedEvidence?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }

  const now = new Date();
  const parsedReview = HumanReviewRecordSchema.safeParse({
    id: `${reviewCase.id}_${now.getTime()}`,
    decisionId: reviewCase.receipt.decisionId,
    reviewer: {
      id: auth.workspace.userId,
      kind: "human",
      name: auth.workspace.displayName ?? auth.workspace.email ?? "Workspace reviewer",
      metadata: { identitySource: "supabase-auth", workspaceRole: auth.workspace.role },
    },
    action: body.action,
    rationale: body.rationale,
    requestedEvidence: body.requestedEvidence ?? [],
    submittedAt: now.toISOString(),
  });
  if (!parsedReview.success) return NextResponse.json({ error: "INVALID_REVIEW", issues: parsedReview.error.issues }, { status: 400 });
  if (reviewCase.context.kind !== "github") return NextResponse.json({ error: "UNSUPPORTED_REVIEW_CONTEXT" }, { status: 501 });

  try {
    const result = await evaluateGitHubSnapshot({
      snapshot: reviewCase.context.snapshot,
      operation: reviewCase.context.operation,
      restrictedWindow: reviewCase.context.restrictedWindow,
      ...(reviewCase.context.incident ? { incident: reviewCase.context.incident } : {}),
      humanReview: parsedReview.data,
      now,
    });

    const updated = {
      ...reviewCase,
      projectId: auth.workspace.projectId,
      environmentId: auth.workspace.environmentId,
      status: result.orchestration.decision.outcome === "REVIEW" ? "pending" as const : "resolved" as const,
      review: parsedReview.data,
      resolutionReceipt: result.receipt,
      updatedAt: now.toISOString(),
    };
    await store.save(updated);

    const decisionStore = getOptionalDecisionStore();
    if (decisionStore) {
      try {
        await decisionStore.save({
          id: result.receipt.receiptId,
          workspaceId,
          projectId: auth.workspace.projectId,
          environmentId: auth.workspace.environmentId,
          source: "integration",
          receipt: result.receipt,
          createdAt: result.receipt.timestamps.receiptCreatedAt,
        });
      } catch (error) {
        logServerEvent("warn", "review.decision.persistence.failed", { reviewCaseId: id, workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId, message: error instanceof Error ? error.message : "Decision persistence failed" });
      }
    }

    logServerEvent("info", "human_review.completed", {
      reviewCaseId: id, workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId,
      reviewAction: parsedReview.data.action, reviewerId: parsedReview.data.reviewer.id,
      resultingOutcome: result.orchestration.decision.outcome, receiptId: result.receipt.receiptId,
    });

    return NextResponse.json({ case: updated, outcome: result.orchestration.decision.outcome, receipt: result.receipt, trace: result.orchestration.trace, providerTrace: result.orchestration.contextualTrace, persistence });
  } catch (error) {
    logServerEvent("error", "human_review.reevaluation.failed", { reviewCaseId: id, workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId, message: error instanceof Error ? error.message : "Re-evaluation failed" });
    return NextResponse.json({ error: "REEVALUATION_FAILED", message: "The action remains in REVIEW; no execution was approved." }, { status: 503 });
  }
}

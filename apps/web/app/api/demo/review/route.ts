import { NextResponse } from "next/server";
import {
  FLAGSHIP_REVIEW_CASE_ID,
  createFlagshipDemoHumanReview,
  runFlagshipDemo,
} from "../../../../lib/flagship-demo";
import { getOptionalDecisionStore } from "../../../../lib/server/decision-store";
import { readServerEnvironment } from "../../../../lib/server/env";
import { logServerEvent } from "../../../../lib/server/observability";
import { consumeRateLimit, requestClientKey } from "../../../../lib/server/rate-limit";
import { getReviewStore } from "../../../../lib/server/review-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let environment;
  try {
    environment = readServerEnvironment();
  } catch {
    return NextResponse.json({ error: "server configuration is invalid" }, { status: 500 });
  }

  const rate = consumeRateLimit({
    key: `demo-review:${requestClientKey(request)}`,
    limit: environment.demoRateLimitPerMinute,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "demo rate limit exceeded; retry shortly" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) },
      },
    );
  }

  let reviewCaseId: string;
  try {
    const body = (await request.json()) as { reviewCaseId?: unknown };
    if (body.reviewCaseId !== FLAGSHIP_REVIEW_CASE_ID) {
      return NextResponse.json({ error: "invalid flagship review case" }, { status: 400 });
    }
    reviewCaseId = body.reviewCaseId;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const now = new Date();
    const humanReview = createFlagshipDemoHumanReview(now);
    const result = await runFlagshipDemo("needs-approval", { now, humanReview });

    const decisionStore = getOptionalDecisionStore();
    if (decisionStore) {
      try {
        await decisionStore.save({
          id: result.receipt.receiptId,
          workspaceId: environment.demoWorkspaceId,
          source: "demo",
          receipt: result.receipt,
          createdAt: result.receipt.timestamps.receiptCreatedAt,
        });
      } catch (error) {
        logServerEvent("warn", "demo.review.decision_persistence.failed", {
          reviewCaseId,
          receiptId: result.receipt.receiptId,
          message: error instanceof Error ? error.message : "Decision persistence failed",
        });
      }
    }

    const reviews = getReviewStore();
    try {
      const existing = await reviews.store.get(environment.demoWorkspaceId, reviewCaseId);
      if (existing) {
        await reviews.store.save({
          ...existing,
          status: result.orchestration.decision.outcome === "REVIEW" ? "pending" : "resolved",
          review: humanReview,
          resolutionReceipt: result.receipt,
          updatedAt: now.toISOString(),
        });
      }
    } catch (error) {
      logServerEvent("warn", "demo.review.persistence.failed", {
        reviewCaseId,
        message: error instanceof Error ? error.message : "Review persistence failed",
      });
    }

    logServerEvent("info", "demo.review.completed", {
      reviewCaseId,
      outcome: result.orchestration.decision.outcome,
      receiptId: result.receipt.receiptId,
      providerStatus: result.orchestration.contextualTrace?.providerStatus,
    });

    return NextResponse.json({
      stage: "resolved" as const,
      outcome: result.orchestration.decision.outcome,
      summary: result.orchestration.decision.summary,
      deterministicFindings: result.orchestration.decision.deterministicFindings,
      contextualFindings: result.orchestration.decision.contextualFindings,
      requirementsToChangeOutcome: result.receipt.requirementsToChangeOutcome,
      trace: result.orchestration.trace,
      providerTrace: result.orchestration.contextualTrace,
      receipt: result.receipt,
      persistence: decisionStore ? "stored" : "disabled",
      reviewCaseId,
    });
  } catch (error) {
    logServerEvent("error", "demo.review.failed", {
      reviewCaseId,
      message: error instanceof Error ? error.message : "Demo review failed",
    });
    return NextResponse.json(
      { error: "re-evaluation failed safely; no action was approved" },
      { status: 503 },
    );
  }
}

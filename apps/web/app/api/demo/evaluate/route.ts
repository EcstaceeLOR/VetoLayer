import { NextResponse } from "next/server";
import {
  FLAGSHIP_INCIDENT,
  FLAGSHIP_REVIEW_CASE_ID,
  flagshipSnapshot,
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
  } catch (error) {
    logServerEvent("error", "server.configuration.invalid", {
      message: error instanceof Error ? error.message : "Invalid server configuration",
    });
    return NextResponse.json(
      { error: "server configuration is invalid" },
      { status: 500 },
    );
  }

  const rate = consumeRateLimit({
    key: `demo:${requestClientKey(request)}`,
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

  try {
    const body = (await request.json()) as { stage?: string };
    if (body.stage !== undefined && body.stage !== "needs-approval") {
      return NextResponse.json(
        { error: "the resolved demo state must be reached through the human-review endpoint" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const now = new Date();
    const result = await runFlagshipDemo("needs-approval", { now });
    const store = getOptionalDecisionStore();

    if (store) {
      try {
        await store.save({
          id: result.receipt.receiptId,
          workspaceId: environment.demoWorkspaceId,
          source: "demo",
          receipt: result.receipt,
          createdAt: result.receipt.timestamps.receiptCreatedAt,
        });
      } catch (error) {
        logServerEvent("warn", "decision.persistence.failed", {
          receiptId: result.receipt.receiptId,
          message: error instanceof Error ? error.message : "Persistence failed",
        });
      }
    }

    let reviewCaseId: string | undefined;
    let reviewPersistence: "supabase" | "memory" | undefined;
    if (result.orchestration.decision.outcome === "REVIEW") {
      const review = getReviewStore();
      reviewCaseId = FLAGSHIP_REVIEW_CASE_ID;
      reviewPersistence = review.persistence;
      try {
        await review.store.save({
          id: reviewCaseId,
          workspaceId: environment.demoWorkspaceId,
          status: "pending",
          title: "Deploy auth security patch to production",
          source: "demo",
          receipt: result.receipt,
          context: {
            kind: "github",
            snapshot: flagshipSnapshot("needs-approval"),
            operation: "deploy-production",
            restrictedWindow: true,
            incident: FLAGSHIP_INCIDENT,
          },
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      } catch (error) {
        logServerEvent("warn", "review.persistence.failed", {
          reviewCaseId,
          message: error instanceof Error ? error.message : "Review persistence failed",
        });
      }
    }

    logServerEvent("info", "demo.evaluation.completed", {
      stage: "needs-approval",
      outcome: result.orchestration.decision.outcome,
      receiptId: result.receipt.receiptId,
      reviewCaseId,
      providerStatus: result.orchestration.contextualTrace?.providerStatus,
    });

    return NextResponse.json({
      stage: "needs-approval" as const,
      outcome: result.orchestration.decision.outcome,
      summary: result.orchestration.decision.summary,
      deterministicFindings: result.orchestration.decision.deterministicFindings,
      contextualFindings: result.orchestration.decision.contextualFindings,
      requirementsToChangeOutcome: result.receipt.requirementsToChangeOutcome,
      trace: result.orchestration.trace,
      providerTrace: result.orchestration.contextualTrace,
      receipt: result.receipt,
      persistence: store ? "stored" : "disabled",
      reviewCaseId,
      reviewPersistence,
    });
  } catch (error) {
    logServerEvent("error", "demo.evaluation.failed", {
      stage: "needs-approval",
      message: error instanceof Error ? error.message : "Evaluation failed",
    });
    return NextResponse.json(
      { error: "evaluation failed safely; no action was approved" },
      { status: 503 },
    );
  }
}

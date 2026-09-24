import { NextResponse } from "next/server";
import { runFlagshipDemo, type DemoStage } from "../../../../lib/flagship-demo";
import { getOptionalDecisionStore } from "../../../../lib/server/decision-store";
import { readServerEnvironment } from "../../../../lib/server/env";
import { logServerEvent } from "../../../../lib/server/observability";
import { consumeRateLimit, requestClientKey } from "../../../../lib/server/rate-limit";

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

  let stage: DemoStage;
  try {
    const body = (await request.json()) as { stage?: string };
    if (body.stage !== "needs-approval" && body.stage !== "resolved") {
      return NextResponse.json(
        { error: "stage must be needs-approval or resolved" },
        { status: 400 },
      );
    }
    stage = body.stage;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await runFlagshipDemo(stage, { now: new Date() });
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

    logServerEvent("info", "demo.evaluation.completed", {
      stage,
      outcome: result.orchestration.decision.outcome,
      receiptId: result.receipt.receiptId,
      providerStatus: result.orchestration.contextualTrace?.providerStatus,
    });

    return NextResponse.json({
      stage,
      outcome: result.orchestration.decision.outcome,
      summary: result.orchestration.decision.summary,
      deterministicFindings: result.orchestration.decision.deterministicFindings,
      contextualFindings: result.orchestration.decision.contextualFindings,
      requirementsToChangeOutcome: result.receipt.requirementsToChangeOutcome,
      trace: result.orchestration.trace,
      providerTrace: result.orchestration.contextualTrace,
      receipt: result.receipt,
      persistence: store ? "stored" : "disabled",
    });
  } catch (error) {
    logServerEvent("error", "demo.evaluation.failed", {
      stage,
      message: error instanceof Error ? error.message : "Evaluation failed",
    });
    return NextResponse.json(
      { error: "evaluation failed safely; no action was approved" },
      { status: 503 },
    );
  }
}

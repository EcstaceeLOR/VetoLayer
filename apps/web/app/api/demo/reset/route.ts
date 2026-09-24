import { NextResponse } from "next/server";
import { getOptionalDecisionStore } from "../../../../lib/server/decision-store";
import { readServerEnvironment } from "../../../../lib/server/env";
import { logServerEvent } from "../../../../lib/server/observability";
import { getReviewStore } from "../../../../lib/server/review-store";

export const runtime = "nodejs";

export async function DELETE() {
  try {
    const environment = readServerEnvironment();
    const decisions = getOptionalDecisionStore();
    const reviews = getReviewStore();

    await Promise.all([
      decisions?.clearDemo(environment.demoWorkspaceId) ?? Promise.resolve(),
      reviews.store.clearDemo(environment.demoWorkspaceId),
    ]);

    logServerEvent("info", "demo.history.reset", {
      workspaceId: environment.demoWorkspaceId,
      decisionPersistence: decisions ? "supabase" : "disabled",
      reviewPersistence: reviews.persistence,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logServerEvent("error", "demo.history.reset_failed", {
      message: error instanceof Error ? error.message : "Demo reset failed",
    });
    return NextResponse.json({ error: "demo reset failed" }, { status: 503 });
  }
}

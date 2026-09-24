import { NextResponse } from "next/server";
import { getOptionalDecisionStore } from "../../../../lib/server/decision-store";
import { readServerEnvironment } from "../../../../lib/server/env";
import { logServerEvent } from "../../../../lib/server/observability";

export const runtime = "nodejs";

export async function DELETE() {
  try {
    const environment = readServerEnvironment();
    const store = getOptionalDecisionStore();
    if (!store) {
      return new NextResponse(null, { status: 204 });
    }

    await store.clearDemo(environment.demoWorkspaceId);
    logServerEvent("info", "demo.history.reset", {
      workspaceId: environment.demoWorkspaceId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logServerEvent("error", "demo.history.reset_failed", {
      message: error instanceof Error ? error.message : "Demo reset failed",
    });
    return NextResponse.json({ error: "demo reset failed" }, { status: 503 });
  }
}

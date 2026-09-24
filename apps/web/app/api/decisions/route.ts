import { NextResponse } from "next/server";
import { getOptionalDecisionStore } from "../../../lib/server/decision-store";
import { readServerEnvironment } from "../../../lib/server/env";
import { logServerEvent } from "../../../lib/server/observability";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let environment;
  try {
    environment = readServerEnvironment();
  } catch {
    return NextResponse.json({ error: "server configuration is invalid" }, { status: 500 });
  }

  const store = getOptionalDecisionStore();
  if (!store) {
    return NextResponse.json({ decisions: [], persistence: "disabled" });
  }

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit ? Number(rawLimit) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return NextResponse.json(
      { error: "limit must be an integer between 1 and 200" },
      { status: 400 },
    );
  }

  try {
    const decisions = await store.list(environment.demoWorkspaceId, limit);
    return NextResponse.json({ decisions, persistence: "supabase" });
  } catch (error) {
    logServerEvent("error", "decision.persistence.read_failed", {
      message: error instanceof Error ? error.message : "Decision list failed",
    });
    return NextResponse.json(
      { error: "decision history is temporarily unavailable" },
      { status: 503 },
    );
  }
}

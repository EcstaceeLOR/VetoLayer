import { NextResponse } from "next/server";
import { requireApiWorkspace } from "../../../lib/server/api-auth";
import { getOptionalDecisionStore } from "../../../lib/server/decision-store";
import { logServerEvent } from "../../../lib/server/observability";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiWorkspace("decisions.read");
  if (!auth.ok) return auth.response;

  const store = getOptionalDecisionStore();
  if (!store) return NextResponse.json({ decisions: [], persistence: "disabled", scope: { projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId } });

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit ? Number(rawLimit) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return NextResponse.json({ error: "limit must be an integer between 1 and 200" }, { status: 400 });

  try {
    const decisions = await store.list(auth.workspace.workspaceId, limit, { projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId });
    return NextResponse.json({ decisions, persistence: "supabase", scope: { workspaceId: auth.workspace.workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId } });
  } catch (error) {
    logServerEvent("error", "decision.persistence.read_failed", { message: error instanceof Error ? error.message : "Decision list failed", workspaceId: auth.workspace.workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId });
    return NextResponse.json({ error: "decision history is temporarily unavailable" }, { status: 503 });
  }
}

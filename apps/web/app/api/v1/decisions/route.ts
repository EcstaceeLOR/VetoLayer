import { NextResponse } from "next/server";
import { getDecisionStore } from "../../../../lib/server/decision-store";
import { authenticateDeveloperRequest } from "../../../../lib/server/developer-key-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authenticateDeveloperRequest(request, "read:decisions");
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.trunc(requestedLimit))) : 50;
  try {
    const { store } = getDecisionStore();
    const decisions = await store.list(auth.credential.scope.workspaceId, limit, {
      projectId: auth.credential.scope.projectId,
      environmentId: auth.credential.scope.environmentId,
    });
    return NextResponse.json({
      scope: auth.credential.scope,
      count: decisions.length,
      decisions: decisions.map((record) => ({
        id: record.id,
        source: record.source,
        createdAt: record.createdAt,
        receipt: record.receipt,
      })),
    });
  } catch {
    return NextResponse.json({ error: { code: "DECISION_READ_FAILED", message: "VetoLayer could not load decisions for this API key." } }, { status: 503 });
  }
}

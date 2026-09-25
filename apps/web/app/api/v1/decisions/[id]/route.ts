import { NextResponse } from "next/server";
import { getDecisionStore } from "../../../../../lib/server/decision-store";
import { authenticateDeveloperRequest } from "../../../../../lib/server/developer-key-auth";
import type { ApiErrorBody } from "../../../../../lib/server/developer-api";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateDeveloperRequest(request, "read:decisions");
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { id } = await context.params;
  const scope = auth.credential.scope;
  const { store, persistence } = getDecisionStore();

  try {
    const record = await store.get(scope.workspaceId, id);
    const belongsToCredential = record
      && record.projectId === scope.projectId
      && record.environmentId === scope.environmentId;
    if (!belongsToCredential) {
      return NextResponse.json<ApiErrorBody>(
        { error: { code: "DECISION_NOT_FOUND", message: "No Decision Receipt was found for this API key and id." } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      status: {
        decisionId: record.receipt.decisionId,
        outcome: record.receipt.outcome,
        summary: record.receipt.decisionSummary,
        decidedAt: record.receipt.timestamps.decidedAt,
      },
      receipt: record.receipt,
      source: record.source,
      createdAt: record.createdAt,
      scope,
      persistence,
    });
  } catch {
    return NextResponse.json<ApiErrorBody>(
      { error: { code: "DECISION_STORE_UNAVAILABLE", message: "Decision status is temporarily unavailable." } },
      { status: 503 },
    );
  }
}

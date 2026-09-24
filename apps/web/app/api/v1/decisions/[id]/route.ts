import { NextResponse } from "next/server";
import { developerApiWorkspaceId } from "../../../../../lib/server/api-workspace";
import { getDecisionStore } from "../../../../../lib/server/decision-store";
import { authorizeDeveloperRequest, type ApiErrorBody } from "../../../../../lib/server/developer-api";
import { readServerEnvironment } from "../../../../../lib/server/env";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const environment = readServerEnvironment();
  const authFailure = authorizeDeveloperRequest(request, environment);
  if (authFailure) {
    return NextResponse.json(authFailure.body, { status: authFailure.status });
  }

  const workspaceId = developerApiWorkspaceId(environment);
  const { store, persistence } = getDecisionStore();

  try {
    const record = await store.get(workspaceId, id);
    if (!record) {
      return NextResponse.json<ApiErrorBody>(
        { error: { code: "DECISION_NOT_FOUND", message: "No Decision Receipt was found for this API workspace and id." } },
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
      persistence,
    });
  } catch {
    return NextResponse.json<ApiErrorBody>(
      { error: { code: "DECISION_STORE_UNAVAILABLE", message: "Decision status is temporarily unavailable." } },
      { status: 503 },
    );
  }
}

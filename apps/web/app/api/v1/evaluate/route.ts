import { createDecisionReceipt, evaluateAction } from "@vetolayer/core";
import { evaluateDeterministicPolicies } from "@vetolayer/policies";
import { evaluateWithServ, readServEnvironment } from "@vetolayer/serv";
import { NextResponse } from "next/server";
import { developerApiWorkspaceId } from "../../../../lib/server/api-workspace";
import { getDecisionStore } from "../../../../lib/server/decision-store";
import {
  authorizeDeveloperRequest,
  parseDeveloperEvaluationPayload,
  type ApiErrorBody,
} from "../../../../lib/server/developer-api";
import { readServerEnvironment } from "../../../../lib/server/env";
import { logServerEvent } from "../../../../lib/server/observability";
import { consumeRateLimit, requestClientKey } from "../../../../lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let environment;
  try {
    environment = readServerEnvironment();
  } catch {
    return apiError("SERVER_CONFIGURATION_INVALID", "VetoLayer server configuration is invalid.", 500);
  }

  const authError = authorizeDeveloperRequest(request, environment);
  if (authError) return NextResponse.json(authError, { status: 401 });

  const rate = consumeRateLimit({
    key: `api:${requestClientKey(request)}`,
    limit: environment.apiRateLimitPerMinute,
  });
  if (!rate.allowed) {
    return NextResponse.json<ApiErrorBody>(
      { error: { code: "RATE_LIMITED", message: "VetoLayer API rate limit exceeded." } },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const parsed = parseDeveloperEvaluationPayload(raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });

  const now = new Date();
  const requestId = `req_${parsed.data.action.id}_${now.getTime()}`;

  try {
    const orchestration = await evaluateAction(
      {
        action: parsed.data.action,
        policies: parsed.data.policies,
        evidence: parsed.data.evidence,
        facts: parsed.data.facts,
        environment: parsed.data.environment,
        now,
        decisionId: `decision_${parsed.data.action.id}_${now.getTime()}`,
      },
      {
        evaluateDeterministic: (input) => evaluateDeterministicPolicies(input),
        evaluateContextual: (input) => evaluateWithServ(input, readServEnvironment()),
      },
    );

    const receipt = await createDecisionReceipt({
      orchestration,
      action: parsed.data.action,
      policies: parsed.data.policies,
      evidence: parsed.data.evidence,
      createdAt: now,
      receiptId: `receipt_${parsed.data.action.id}_${now.getTime()}`,
    });

    const workspaceId = developerApiWorkspaceId(environment);
    const { store, persistence } = getDecisionStore();
    try {
      await store.save({
        id: receipt.receiptId,
        workspaceId,
        source: "api",
        receipt,
        createdAt: receipt.timestamps.receiptCreatedAt,
      });
    } catch (error) {
      logServerEvent("warn", "api.decision.persistence.failed", {
        requestId,
        receiptId: receipt.receiptId,
        workspaceId,
        message: error instanceof Error ? error.message : "Decision persistence failed",
      });
    }

    logServerEvent("info", "api.evaluation.completed", {
      requestId,
      workspaceId,
      actionRequestId: parsed.data.action.id,
      outcome: orchestration.decision.outcome,
      receiptId: receipt.receiptId,
      providerStatus: orchestration.contextualTrace?.providerStatus,
    });

    return NextResponse.json(
      {
        requestId,
        decision: orchestration.decision,
        receipt,
        trace: orchestration.trace,
        providerTrace: orchestration.contextualTrace,
        persistence,
      },
      { status: 200, headers: { "X-VetoLayer-Request-Id": requestId } },
    );
  } catch (error) {
    logServerEvent("error", "api.evaluation.failed", {
      requestId,
      message: error instanceof Error ? error.message : "Evaluation failed",
    });
    return apiError(
      "EVALUATION_FAILED",
      "VetoLayer could not complete the evaluation. No action was approved.",
      503,
    );
  }
}

function apiError(code: string, message: string, status: number) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status });
}

import { NextResponse } from "next/server";
import {
  parseDeveloperEvaluationPayload,
  type ApiErrorBody,
} from "../../../../lib/server/developer-api";
import { executeDeveloperEvaluation } from "../../../../lib/server/developer-evaluation-service";
import { authenticateDeveloperRequest } from "../../../../lib/server/developer-key-auth";
import { readServerEnvironment } from "../../../../lib/server/env";
import { logServerEvent } from "../../../../lib/server/observability";
import { consumeRateLimit, requestClientKey } from "../../../../lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateDeveloperRequest(request, "evaluate");
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  let environment;
  try { environment = readServerEnvironment(); } catch { return apiError("SERVER_CONFIGURATION_INVALID", "VetoLayer server configuration is invalid.", 500); }

  const rateKey = auth.credential.keyId ? `api-key:${auth.credential.keyId}` : `api:${requestClientKey(request)}`;
  const rate = consumeRateLimit({ key: rateKey, limit: environment.apiRateLimitPerMinute });
  if (!rate.allowed) {
    return NextResponse.json<ApiErrorBody>(
      { error: { code: "RATE_LIMITED", message: "VetoLayer API rate limit exceeded." } },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) } },
    );
  }

  let raw: unknown;
  try { raw = await request.json(); } catch { return apiError("INVALID_JSON", "Request body must be valid JSON.", 400); }
  const parsed = parseDeveloperEvaluationPayload(raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });

  try {
    const result = await executeDeveloperEvaluation({
      payload: parsed.data,
      scope: auth.credential.scope,
      ...(auth.credential.keyId ? { keyId: auth.credential.keyId } : {}),
    });
    return NextResponse.json(result, { status: 200, headers: { "X-VetoLayer-Request-Id": result.requestId } });
  } catch (error) {
    const requestId = `failed_${parsed.data.action.id}_${Date.now()}`;
    logServerEvent("error", "api.evaluation.failed", {
      requestId,
      ...auth.credential.scope,
      message: error instanceof Error ? error.message : "Evaluation failed",
    });
    return apiError("EVALUATION_FAILED", "VetoLayer could not complete the evaluation. No action was approved.", 503);
  }
}

function apiError(code: string, message: string, status: number) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status });
}

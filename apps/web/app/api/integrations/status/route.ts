import { NextResponse } from "next/server";
import type { IntegrationKey, IntegrationTestResult } from "../../../../lib/integration-contracts";
import { requireApiWorkspace } from "../../../../lib/server/api-auth";
import { getIntegrationReadiness, testDeveloperApiIntegration, testGitHubIntegration } from "../../../../lib/server/integration-health";
import { getIntegrationStore } from "../../../../lib/server/integration-store";
import { consumeRateLimit, requestClientKey } from "../../../../lib/server/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiWorkspace();
  if (!auth.ok) return auth.response;

  try {
    const { store, persistence } = getIntegrationStore();
    const connections = await store.list(auth.workspace.workspaceId);
    return NextResponse.json({
      readiness: getIntegrationReadiness(),
      connections,
      persistence,
    });
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_SERVER_CONFIGURATION", message: "Integration status is unavailable because the server configuration is invalid." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApiWorkspace();
  if (!auth.ok) return auth.response;

  const rate = consumeRateLimit({
    key: `integration-test:${auth.workspace.userId}:${requestClientKey(request)}`,
    limit: 10,
  });
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many integration tests. Try again shortly." } },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON." } },
      { status: 400 },
    );
  }

  const integration =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { integration?: unknown }).integration
      : undefined;

  if (integration !== "github" && integration !== "developer-api") {
    return NextResponse.json(
      { error: { code: "INVALID_INTEGRATION", message: "integration must be github or developer-api." } },
      { status: 400 },
    );
  }

  try {
    const result = await testIntegration(integration);
    const { store, persistence } = getIntegrationStore();
    await store.save({
      workspaceId: auth.workspace.workspaceId,
      integration,
      state: stateFromResult(result),
      ...(readAccount(result) ? { account: readAccount(result) } : {}),
      lastCode: result.code,
      updatedAt: new Date().toISOString(),
    });
    const connections = await store.list(auth.workspace.workspaceId);

    return NextResponse.json({
      result,
      readiness: getIntegrationReadiness(),
      connections,
      persistence,
    });
  } catch {
    return NextResponse.json(
      { error: { code: "INTEGRATION_TEST_FAILED", message: "The integration test could not be completed safely." } },
      { status: 500 },
    );
  }
}

async function testIntegration(integration: IntegrationKey) {
  return integration === "github"
    ? testGitHubIntegration()
    : testDeveloperApiIntegration();
}

function stateFromResult(result: IntegrationTestResult) {
  if (!result.ok) return "needs-config" as const;
  return result.level === "warning" ? "warning" as const : "ready" as const;
}

function readAccount(result: IntegrationTestResult) {
  const account = result.details?.account;
  return typeof account === "string" ? account : undefined;
}

import { NextResponse } from "next/server";
import type { IntegrationKey } from "../../../../lib/integration-contracts";
import { getIntegrationReadiness, testDeveloperApiIntegration, testGitHubIntegration } from "../../../../lib/server/integration-health";
import { consumeRateLimit, requestClientKey } from "../../../../lib/server/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ readiness: getIntegrationReadiness() });
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_SERVER_CONFIGURATION", message: "Integration status is unavailable because the server configuration is invalid." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const rate = consumeRateLimit({
    key: `integration-test:${requestClientKey(request)}`,
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
    return NextResponse.json({ result, readiness: getIntegrationReadiness() });
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

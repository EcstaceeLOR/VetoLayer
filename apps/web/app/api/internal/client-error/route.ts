import { NextResponse } from "next/server";
import { logServerEvent, requestCorrelationId } from "../../../../lib/server/observability";
import { consumeRateLimit, requestClientKey } from "../../../../lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = requestCorrelationId(request);
  const rate = consumeRateLimit({ key: `client-error:${requestClientKey(request)}`, limit: 30 });
  if (!rate.allowed) return new NextResponse(null, { status: 204, headers: { "X-VetoLayer-Request-Id": requestId } });

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch {
    // Error reporting must never create a second user-facing failure.
  }

  logServerEvent("error", "client.unhandled_error", {
    requestId,
    errorName: String(body.errorName ?? "ClientError").slice(0, 120),
    message: String(body.message ?? "Client-side rendering failure").slice(0, 500),
    digest: body.digest ? String(body.digest).slice(0, 160) : undefined,
    path: body.path ? String(body.path).slice(0, 500) : undefined,
  });

  return new NextResponse(null, { status: 204, headers: { "X-VetoLayer-Request-Id": requestId } });
}

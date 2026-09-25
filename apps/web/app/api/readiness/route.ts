import { NextResponse } from "next/server";
import { isSupabaseAuthConfigured } from "../../../lib/supabase/server";
import { buildReadinessSnapshot } from "../../../lib/server/readiness";
import { requestCorrelationId } from "../../../lib/server/observability";

export const runtime = "nodejs";

export function GET(request: Request) {
  const requestId = requestCorrelationId(request);
  const snapshot = buildReadinessSnapshot(process.env, isSupabaseAuthConfigured());
  return NextResponse.json(
    {
      ...snapshot,
      service: "vetolayer-web",
      requestId,
      timestamp: new Date().toISOString(),
    },
    {
      status: snapshot.ready ? 200 : 503,
      headers: { "X-VetoLayer-Request-Id": requestId, "Cache-Control": "no-store" },
    },
  );
}

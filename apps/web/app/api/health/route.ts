import { NextResponse } from "next/server";
import { readServerEnvironment } from "../../../lib/server/env";

export const runtime = "nodejs";

export function GET() {
  try {
    const environment = readServerEnvironment();
    return NextResponse.json({
      status: "ok",
      service: "vetolayer-web",
      serv: environment.servConfigured ? "configured" : "not-configured",
      persistence: environment.persistenceConfigured ? "configured" : "not-configured",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", service: "vetolayer-web", timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}

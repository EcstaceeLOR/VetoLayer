import { NextResponse } from "next/server";
import { readServerEnvironment } from "../../../lib/server/env";
import { isSupabaseAuthConfigured } from "../../../lib/supabase/server";

export const runtime = "nodejs";

export function GET() {
  try {
    const environment = readServerEnvironment();
    const authConfigured = isSupabaseAuthConfigured();
    return NextResponse.json({
      status: "ok",
      service: "vetolayer-web",
      demoReady: environment.servConfigured,
      serv: environment.servConfigured ? "configured" : "not-configured",
      auth: authConfigured ? "configured" : "not-configured",
      persistence: environment.persistenceConfigured ? "configured" : "not-configured",
      github: environment.githubTokenConfigured ? "configured" : "not-configured",
      developerApi: environment.apiAuthConfigured ? "configured" : "disabled",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", service: "vetolayer-web", demoReady: false, timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}

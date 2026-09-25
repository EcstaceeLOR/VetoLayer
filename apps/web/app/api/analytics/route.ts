import { NextResponse } from "next/server";
import { requireApiWorkspace } from "../../../lib/server/api-auth";
import { loadOperationalAnalytics, parseAnalyticsFilters } from "../../../lib/server/operational-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiWorkspace("decisions.read");
  if (!auth.ok) return auth.response;
  try {
    const filters = parseAnalyticsFilters(new URL(request.url).searchParams);
    const data = await loadOperationalAnalytics(auth.workspace.workspaceId, filters);
    return NextResponse.json({
      report: data.report,
      projects: data.projects.map(({ id, name, status }) => ({ id, name, status })),
      environments: data.environments.map(({ id, projectId, name, status, kind }) => ({ id, projectId, name, status, kind })),
      persistence: data.persistence,
      auditAvailable: data.auditAvailable,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: { code: "ANALYTICS_UNAVAILABLE", message: "Operational analytics could not be loaded from persisted product data." } }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

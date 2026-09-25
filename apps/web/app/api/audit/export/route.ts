import { requireApiWorkspace } from "../../../../lib/server/api-auth";
import { getAuditStore, type AuditEvent, type AuditFilter } from "../../../../lib/server/audit-store";

export const runtime = "nodejs";

function readDate(value: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function filtersFromUrl(url: URL): AuditFilter {
  const actor = url.searchParams.get("actor")?.trim();
  const action = url.searchParams.get("action")?.trim();
  const resource = url.searchParams.get("resource")?.trim();
  const projectId = url.searchParams.get("projectId")?.trim();
  const environmentId = url.searchParams.get("environmentId")?.trim();
  const from = readDate(url.searchParams.get("from"));
  const to = readDate(url.searchParams.get("to"));
  return {
    limit: 5_000,
    ...(actor ? { actor } : {}),
    ...(action ? { action } : {}),
    ...(resource ? { resource } : {}),
    ...(projectId ? { projectId } : {}),
    ...(environmentId ? { environmentId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

function csvCell(value: unknown) {
  const text = typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(events: AuditEvent[]) {
  const header = ["timestamp", "actor", "actor_user_id", "actor_role", "action", "category", "resource_type", "resource_id", "resource_label", "project_id", "environment_id", "request_id", "correlation_id", "href", "metadata"];
  const rows = events.map((event) => [
    event.createdAt,
    event.actorLabel ?? event.actorKind,
    event.actorUserId,
    event.actorRole,
    event.action,
    event.category,
    event.targetType,
    event.targetId,
    event.targetLabel,
    event.projectId,
    event.environmentId,
    event.requestId,
    event.correlationId,
    event.href,
    event.metadata,
  ].map(csvCell).join(","));
  return [header.map(csvCell).join(","), ...rows].join("\n");
}

export async function GET(request: Request) {
  const auth = await requireApiWorkspace("audit.export");
  if (!auth.ok) return auth.response;
  const { store, persistence } = getAuditStore();
  if (process.env.NODE_ENV === "production" && persistence !== "supabase") {
    return new Response(JSON.stringify({ error: { code: "AUDIT_PERSISTENCE_REQUIRED", message: "Durable audit persistence is required for production export." } }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  try {
    const events = await store.list(auth.workspace.workspaceId, filtersFromUrl(url));
    const truncated = events.length >= 5_000 ? "true" : "false";
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      return new Response(JSON.stringify({ workspaceId: auth.workspace.workspaceId, exportedAt: new Date().toISOString(), truncated: truncated === "true", events }, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="vetolayer-audit-${stamp}.json"`,
          "X-VetoLayer-Audit-Truncated": truncated,
        },
      });
    }
    return new Response(toCsv(events), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vetolayer-audit-${stamp}.csv"`,
        "X-VetoLayer-Audit-Truncated": truncated,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: { code: "AUDIT_EXPORT_FAILED", message: error instanceof Error ? error.message : "Audit export failed." } }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}

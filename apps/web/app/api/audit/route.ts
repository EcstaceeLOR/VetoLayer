import { NextResponse } from "next/server";
import { requireApiWorkspace } from "../../../lib/server/api-auth";
import { getAuditStore, type AuditFilter } from "../../../lib/server/audit-store";
import { getWorkspaceStore } from "../../../lib/server/workspace-store";

export const runtime = "nodejs";

function readDate(value: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function filtersFromUrl(url: URL): AuditFilter {
  const rawLimit = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isInteger(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 100;
  const actor = url.searchParams.get("actor")?.trim();
  const action = url.searchParams.get("action")?.trim();
  const resource = url.searchParams.get("resource")?.trim();
  const projectId = url.searchParams.get("projectId")?.trim();
  const environmentId = url.searchParams.get("environmentId")?.trim();
  const from = readDate(url.searchParams.get("from"));
  const to = readDate(url.searchParams.get("to"));
  const before = readDate(url.searchParams.get("before"));
  return {
    limit,
    ...(actor ? { actor } : {}),
    ...(action ? { action } : {}),
    ...(resource ? { resource } : {}),
    ...(projectId ? { projectId } : {}),
    ...(environmentId ? { environmentId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(before ? { before } : {}),
  };
}

export async function GET(request: Request) {
  const auth = await requireApiWorkspace("audit.read");
  if (!auth.ok) return auth.response;
  const { store, persistence } = getAuditStore();
  if (process.env.NODE_ENV === "production" && persistence !== "supabase") {
    return NextResponse.json({ error: { code: "AUDIT_PERSISTENCE_REQUIRED", message: "Apply the audit migration and configure Supabase server persistence before using the production audit log." } }, { status: 503 });
  }

  try {
    const filters = filtersFromUrl(new URL(request.url));
    const { store: workspaceStore } = getWorkspaceStore();
    const [events, projects] = await Promise.all([
      store.list(auth.workspace.workspaceId, filters),
      workspaceStore.listProjects(auth.workspace.workspaceId, true),
    ]);
    const environments = await Promise.all(projects.map(async (project) => ({
      projectId: project.id,
      environments: await workspaceStore.listEnvironments(auth.workspace.workspaceId, project.id, true),
    })));
    return NextResponse.json({
      events,
      persistence,
      filters,
      scope: { workspaceId: auth.workspace.workspaceId },
      projects: projects.map((project) => ({ id: project.id, name: project.name, status: project.status })),
      environments: environments.flatMap((entry) => entry.environments.map((environment) => ({ id: environment.id, projectId: entry.projectId, name: environment.name, status: environment.status }))),
      nextBefore: events.length ? events[events.length - 1]?.createdAt ?? null : null,
    });
  } catch (error) {
    return NextResponse.json({ error: { code: "AUDIT_UNAVAILABLE", message: error instanceof Error ? error.message : "Audit events could not be loaded." } }, { status: 503 });
  }
}

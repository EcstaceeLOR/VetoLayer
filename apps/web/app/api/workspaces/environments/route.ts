import { NextResponse } from "next/server";
import type { ProjectEnvironment } from "../../../../lib/workspace-model";
import { normalizeEntityName } from "../../../../lib/workspace-model";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../lib/server/api-auth";
import { recordAuditEvent, workspaceAuditInput } from "../../../../lib/server/audit";
import { getWorkspaceStore } from "../../../../lib/server/workspace-store";

const kinds = new Set<ProjectEnvironment["kind"]>(["development", "staging", "production", "custom"]);

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("environments.manage");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  let payload: { name?: unknown; kind?: unknown; projectId?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const name = normalizeEntityName(typeof payload.name === "string" ? payload.name : "", 60);
  const kind = typeof payload.kind === "string" && kinds.has(payload.kind as ProjectEnvironment["kind"])
    ? payload.kind as ProjectEnvironment["kind"]
    : "custom";
  const projectId = typeof payload.projectId === "string" ? payload.projectId : auth.workspace.projectId;
  if (name.length < 2) return NextResponse.json({ error: { code: "INVALID_NAME", message: "Environment name must contain at least two characters." } }, { status: 400 });

  const { store } = getWorkspaceStore();
  const project = await store.getProject(auth.workspace.workspaceId, projectId);
  if (!project || project.status !== "active") return NextResponse.json({ error: { code: "PROJECT_NOT_FOUND", message: "Choose an active project in this workspace." } }, { status: 404 });
  const environment = await store.createEnvironment(auth.workspace.workspaceId, project.id, name, kind);
  await recordAuditEvent({ ...workspaceAuditInput(auth.workspace, {
    action: "environment.create",
    category: "environment",
    targetType: "environment",
    targetId: environment.id,
    targetLabel: environment.name,
    href: "/dashboard/settings#projects",
    request,
    metadata: { kind: environment.kind },
  }), projectId: project.id, environmentId: environment.id });
  return NextResponse.json({ environment }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiWorkspace("environments.manage");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  let payload: { environmentId?: unknown; projectId?: unknown; name?: unknown; expectedUpdatedAt?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const projectId = typeof payload.projectId === "string" ? payload.projectId : auth.workspace.projectId;
  const environmentId = typeof payload.environmentId === "string" ? payload.environmentId : auth.workspace.environmentId;
  const name = normalizeEntityName(typeof payload.name === "string" ? payload.name : "", 60);
  if (name.length < 2) return NextResponse.json({ error: { code: "INVALID_NAME", message: "Environment name must contain at least two characters." } }, { status: 400 });
  const { store } = getWorkspaceStore();
  const previous = await store.getEnvironment(auth.workspace.workspaceId, projectId, environmentId);
  if (!previous) return NextResponse.json({ error: { code: "ENVIRONMENT_NOT_FOUND", message: "Environment was not found in this workspace project." } }, { status: 404 });
  const conflict = staleSetting(payload.expectedUpdatedAt, previous.updatedAt, previous);
  if (conflict) return conflict;
  const environment = await store.renameEnvironment(auth.workspace.workspaceId, projectId, environmentId, name);
  await recordAuditEvent({ ...workspaceAuditInput(auth.workspace, {
    action: "environment.rename",
    category: "environment",
    targetType: "environment",
    targetId: environment.id,
    targetLabel: environment.name,
    href: "/dashboard/settings#projects",
    request,
    metadata: { previousName: previous.name, nextName: environment.name },
  }), projectId, environmentId });
  return NextResponse.json({ environment });
}

export async function DELETE(request: Request) {
  const auth = await requireApiWorkspace("environments.manage");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? auth.workspace.projectId;
  const environmentId = url.searchParams.get("environmentId") ?? auth.workspace.environmentId;
  const expectedUpdatedAt = url.searchParams.get("expectedUpdatedAt");
  const { store } = getWorkspaceStore();
  const target = await store.getEnvironment(auth.workspace.workspaceId, projectId, environmentId);
  if (!target) return NextResponse.json({ error: { code: "ENVIRONMENT_NOT_FOUND", message: "Environment was not found in this workspace project." } }, { status: 404 });
  const conflict = staleSetting(expectedUpdatedAt, target.updatedAt, target);
  if (conflict) return conflict;
  const active = await store.listEnvironments(auth.workspace.workspaceId, projectId);
  if (active.length <= 1 && active.some((environment) => environment.id === environmentId)) {
    return NextResponse.json({ error: { code: "LAST_ENVIRONMENT", message: "A project must keep at least one active environment." } }, { status: 409 });
  }
  await store.archiveEnvironment(auth.workspace.workspaceId, projectId, environmentId);
  await recordAuditEvent({ ...workspaceAuditInput(auth.workspace, {
    action: "environment.archive",
    category: "environment",
    targetType: "environment",
    targetId: target.id,
    targetLabel: target.name,
    href: "/dashboard/settings#danger-zone",
    request,
    metadata: { previousStatus: target.status, nextStatus: "archived", kind: target.kind },
  }), projectId, environmentId });
  return NextResponse.json({ archived: true, environmentId });
}

function staleSetting(expected: unknown, currentUpdatedAt: string, current: unknown) {
  if (typeof expected !== "string" || !expected || expected === currentUpdatedAt) return null;
  return NextResponse.json({ error: { code: "SETTINGS_CONFLICT", message: "This environment changed after the page was loaded. Refresh and review its current state before saving again." }, current }, { status: 409 });
}

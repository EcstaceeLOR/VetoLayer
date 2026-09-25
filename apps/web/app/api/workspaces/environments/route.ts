import { NextResponse } from "next/server";
import type { ProjectEnvironment } from "../../../../lib/workspace-model";
import { normalizeEntityName } from "../../../../lib/workspace-model";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../lib/server/api-auth";
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
  return NextResponse.json({ environment }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiWorkspace("environments.manage");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  let payload: { environmentId?: unknown; projectId?: unknown; name?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const projectId = typeof payload.projectId === "string" ? payload.projectId : auth.workspace.projectId;
  const environmentId = typeof payload.environmentId === "string" ? payload.environmentId : auth.workspace.environmentId;
  const name = normalizeEntityName(typeof payload.name === "string" ? payload.name : "", 60);
  if (name.length < 2) return NextResponse.json({ error: { code: "INVALID_NAME", message: "Environment name must contain at least two characters." } }, { status: 400 });
  const environment = await getWorkspaceStore().store.renameEnvironment(auth.workspace.workspaceId, projectId, environmentId, name);
  return NextResponse.json({ environment });
}

export async function DELETE(request: Request) {
  const auth = await requireApiWorkspace("environments.manage");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? auth.workspace.projectId;
  const environmentId = url.searchParams.get("environmentId") ?? auth.workspace.environmentId;
  const { store } = getWorkspaceStore();
  const active = await store.listEnvironments(auth.workspace.workspaceId, projectId);
  if (active.length <= 1 && active.some((environment) => environment.id === environmentId)) {
    return NextResponse.json({ error: { code: "LAST_ENVIRONMENT", message: "A project must keep at least one active environment." } }, { status: 409 });
  }
  await store.archiveEnvironment(auth.workspace.workspaceId, projectId, environmentId);
  return NextResponse.json({ archived: true, environmentId });
}

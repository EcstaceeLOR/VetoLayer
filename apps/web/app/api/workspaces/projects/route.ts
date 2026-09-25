import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { normalizeEntityName } from "../../../../lib/workspace-model";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../lib/server/api-auth";
import { ENVIRONMENT_COOKIE, PROJECT_COOKIE } from "../../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../../lib/server/workspace-store";

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("projects.manage");
  if (!auth.ok) return auth.response;

  let payload: { name?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const name = normalizeEntityName(typeof payload.name === "string" ? payload.name : "");
  if (name.length < 2) return NextResponse.json({ error: { code: "INVALID_NAME", message: "Project name must contain at least two characters." } }, { status: 400 });

  const { store } = getWorkspaceStore();
  const project = await store.createProject(auth.workspace.workspaceId, name);
  const development = await store.createEnvironment(auth.workspace.workspaceId, project.id, "Development", "development");
  await store.createEnvironment(auth.workspace.workspaceId, project.id, "Staging", "staging");
  const production = await store.createEnvironment(auth.workspace.workspaceId, project.id, "Production", "production");

  const cookieStore = await cookies();
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };
  cookieStore.set(PROJECT_COOKIE, project.id, options);
  cookieStore.set(ENVIRONMENT_COOKIE, production.id, options);
  return NextResponse.json({ project, defaultEnvironment: production, development }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiWorkspace("projects.manage");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  let payload: { projectId?: unknown; name?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const projectId = typeof payload.projectId === "string" ? payload.projectId : auth.workspace.projectId;
  const name = normalizeEntityName(typeof payload.name === "string" ? payload.name : "");
  if (name.length < 2) return NextResponse.json({ error: { code: "INVALID_NAME", message: "Project name must contain at least two characters." } }, { status: 400 });
  const project = await getWorkspaceStore().store.renameProject(auth.workspace.workspaceId, projectId, name);
  return NextResponse.json({ project });
}

export async function DELETE(request: Request) {
  const auth = await requireApiWorkspace("projects.manage");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? auth.workspace.projectId;
  const { store } = getWorkspaceStore();
  const project = await store.getProject(auth.workspace.workspaceId, projectId);
  if (!project) return NextResponse.json({ error: { code: "PROJECT_NOT_FOUND", message: "Project was not found in this workspace." } }, { status: 404 });
  await store.archiveProject(auth.workspace.workspaceId, projectId);
  return NextResponse.json({ archived: true, projectId });
}

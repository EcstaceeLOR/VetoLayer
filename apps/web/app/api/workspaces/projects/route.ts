import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { normalizeEntityName } from "../../../../lib/workspace-model";
import { requireApiWorkspace } from "../../../../lib/server/api-auth";
import { recordAuditEvent, workspaceAuditInput } from "../../../../lib/server/audit";
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
  await recordAuditEvent({
    ...workspaceAuditInput(auth.workspace, {
      action: "project.create",
      category: "project",
      targetType: "project",
      targetId: project.id,
      targetLabel: project.name,
      href: "/dashboard/workspace",
      request,
      metadata: { defaultEnvironmentId: production.id },
    }),
    projectId: project.id,
    environmentId: production.id,
  });
  return NextResponse.json({ project, defaultEnvironment: production, development }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiWorkspace("projects.manage");
  if (!auth.ok) return auth.response;

  let payload: { projectId?: unknown; name?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const projectId = typeof payload.projectId === "string" ? payload.projectId : auth.workspace.projectId;
  const name = normalizeEntityName(typeof payload.name === "string" ? payload.name : "");
  if (name.length < 2) return NextResponse.json({ error: { code: "INVALID_NAME", message: "Project name must contain at least two characters." } }, { status: 400 });

  const { store } = getWorkspaceStore();
  const target = await store.getProject(auth.workspace.workspaceId, projectId);
  if (!target) return NextResponse.json({ error: { code: "PROJECT_NOT_FOUND", message: "Project was not found in this workspace." } }, { status: 404 });
  if (target.status !== "active") return NextResponse.json({ error: { code: "PROJECT_ARCHIVED", message: "Archived projects retain history but cannot be modified." } }, { status: 409 });
  const project = await store.renameProject(auth.workspace.workspaceId, projectId, name);
  await recordAuditEvent({ ...workspaceAuditInput(auth.workspace, {
    action: "project.rename",
    category: "project",
    targetType: "project",
    targetId: project.id,
    targetLabel: project.name,
    href: "/dashboard/workspace",
    request,
    metadata: { previousName: target.name, nextName: project.name },
  }), projectId });
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
  if (project.status !== "active") return NextResponse.json({ error: { code: "PROJECT_ARCHIVED", message: "This project is already archived." } }, { status: 409 });
  const activeProjects = await store.listProjects(auth.workspace.workspaceId);
  if (activeProjects.length <= 1) {
    return NextResponse.json({ error: { code: "LAST_PROJECT", message: "A workspace must keep at least one active project. Archive the workspace instead if the organization is no longer in use." } }, { status: 409 });
  }
  await store.archiveProject(auth.workspace.workspaceId, projectId);
  await recordAuditEvent({ ...workspaceAuditInput(auth.workspace, {
    action: "project.archive",
    category: "project",
    targetType: "project",
    targetId: project.id,
    targetLabel: project.name,
    href: "/dashboard/workspace",
    request,
    metadata: { previousStatus: project.status, nextStatus: "archived" },
  }), projectId });
  return NextResponse.json({ archived: true, projectId });
}

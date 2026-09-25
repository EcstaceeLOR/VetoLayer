import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ENVIRONMENT_COOKIE, PROJECT_COOKIE, WORKSPACE_COOKIE, getAuthenticatedIdentity } from "../../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../../lib/server/workspace-store";

export async function POST(request: Request) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to switch workspace context." } }, { status: 401 });

  let payload: { workspaceId?: unknown; projectId?: unknown; environmentId?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }

  const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : "";
  const projectId = typeof payload.projectId === "string" ? payload.projectId : "";
  const environmentId = typeof payload.environmentId === "string" ? payload.environmentId : "";
  if (!workspaceId) return NextResponse.json({ error: { code: "WORKSPACE_REQUIRED", message: "Choose a workspace." } }, { status: 400 });

  const { store } = getWorkspaceStore();
  const [workspace, membership] = await Promise.all([
    store.getWorkspace(workspaceId),
    store.getMembership(workspaceId, identity.userId),
  ]);
  if (!workspace || workspace.status !== "active" || !membership) {
    return NextResponse.json({ error: { code: "WORKSPACE_FORBIDDEN", message: "That workspace is not available to this account." } }, { status: 403 });
  }

  const projects = await store.listProjects(workspaceId);
  const project = projects.find((candidate) => candidate.id === projectId) ?? projects[0];
  if (!project || project.status !== "active") {
    return NextResponse.json({ error: { code: "PROJECT_REQUIRED", message: "Choose an active project in this workspace." } }, { status: 409 });
  }

  const environments = await store.listEnvironments(workspaceId, project.id);
  const environment = environments.find((candidate) => candidate.id === environmentId)
    ?? environments.find((candidate) => candidate.kind === "production")
    ?? environments[0];
  if (!environment || environment.status !== "active") {
    return NextResponse.json({ error: { code: "ENVIRONMENT_REQUIRED", message: "Choose an active environment in this project." } }, { status: 409 });
  }

  const cookieStore = await cookies();
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };
  cookieStore.set(WORKSPACE_COOKIE, workspace.id, options);
  cookieStore.set(PROJECT_COOKIE, project.id, options);
  cookieStore.set(ENVIRONMENT_COOKIE, environment.id, options);

  return NextResponse.json({ workspace, project, environment, role: membership.role });
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { normalizeEntityName } from "../../../lib/workspace-model";
import {
  ENVIRONMENT_COOKIE,
  PROJECT_COOKIE,
  WORKSPACE_COOKIE,
  getAuthenticatedIdentity,
  getAuthenticatedWorkspace,
  workspaceIdForUser,
} from "../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../lib/server/workspace-store";

export const runtime = "nodejs";

function persistenceRequired(persistence: "supabase" | "memory") {
  return process.env.NODE_ENV === "production" && persistence !== "supabase";
}

export async function GET() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to access workspaces." } }, { status: 401 });

  const { store, persistence } = getWorkspaceStore();
  if (persistenceRequired(persistence)) {
    return NextResponse.json({ error: { code: "WORKSPACE_PERSISTENCE_REQUIRED", message: "Durable workspace persistence must be configured for production." } }, { status: 503 });
  }

  const memberships = await store.listWorkspacesForUser(identity.userId);
  const context = await getAuthenticatedWorkspace();
  return NextResponse.json({
    persistence,
    workspaces: memberships.map(({ workspace, membership }) => ({ workspace, role: membership.role })),
    current: context ? {
      workspace: context.workspace,
      project: context.project,
      environment: context.environment,
      role: context.role,
      projects: context.availableProjects,
      environments: context.availableEnvironments,
    } : null,
  });
}

export async function POST(request: Request) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in before creating a workspace." } }, { status: 401 });

  const { store, persistence } = getWorkspaceStore();
  if (persistenceRequired(persistence)) {
    return NextResponse.json({ error: { code: "WORKSPACE_PERSISTENCE_REQUIRED", message: "Configure Supabase persistence before creating production workspaces." } }, { status: 503 });
  }

  let payload: { workspaceName?: unknown; projectName?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }

  const workspaceName = normalizeEntityName(typeof payload.workspaceName === "string" ? payload.workspaceName : "");
  const projectName = normalizeEntityName(typeof payload.projectName === "string" ? payload.projectName : "");
  if (workspaceName.length < 2 || projectName.length < 2) {
    return NextResponse.json({ error: { code: "INVALID_WORKSPACE", message: "Workspace and project names must contain at least two characters." } }, { status: 400 });
  }

  try {
    const graph = await store.createWorkspace({
      ownerUserId: identity.userId,
      ...(identity.email ? { ownerEmail: identity.email } : {}),
      ...(identity.displayName ? { ownerDisplayName: identity.displayName } : {}),
      workspaceName,
      projectName,
      legacyWorkspaceId: workspaceIdForUser(identity.userId),
    });
    const production = graph.environments.find((environment) => environment.kind === "production") ?? graph.environments[0];
    if (!production) throw new Error("Workspace did not create an environment");

    const cookieStore = await cookies();
    const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };
    cookieStore.set(WORKSPACE_COOKIE, graph.workspace.id, options);
    cookieStore.set(PROJECT_COOKIE, graph.project.id, options);
    cookieStore.set(ENVIRONMENT_COOKIE, production.id, options);

    return NextResponse.json({ ...graph, currentEnvironment: production, persistence }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: { code: "WORKSPACE_CREATE_FAILED", message: error instanceof Error ? error.message : "Workspace could not be created." } }, { status: 503 });
  }
}

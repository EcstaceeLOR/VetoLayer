import { NextResponse } from "next/server";
import {
  ENVIRONMENT_COOKIE,
  PROJECT_COOKIE,
  WORKSPACE_COOKIE,
} from "../../../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../../../lib/server/workspace-store";
import {
  isReliabilityTestMode,
  normalizeReliabilityProfile,
  RELIABILITY_PROFILE_COOKIE,
  reliabilityIdentity,
} from "../../../../../lib/server/reliability-mode";

export const runtime = "nodejs";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false,
  path: "/",
  maxAge: 60 * 60,
};

export async function GET(request: Request) {
  if (!isReliabilityTestMode()) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }

  const url = new URL(request.url);
  const profile = normalizeReliabilityProfile(url.searchParams.get("profile"));
  const response = NextResponse.json({ ok: true, profile });
  response.cookies.set(RELIABILITY_PROFILE_COOKIE, profile, cookieOptions);

  if (profile === "onboarding") {
    for (const name of [WORKSPACE_COOKIE, PROJECT_COOKIE, ENVIRONMENT_COOKIE]) {
      response.cookies.set(name, "", { ...cookieOptions, maxAge: 0 });
    }
    return response;
  }

  const identity = reliabilityIdentity("operator");
  const { store } = getWorkspaceStore();
  const existing = (await store.listWorkspacesForUser(identity.userId))
    .find(({ workspace }) => workspace.status === "active");

  let workspace;
  let project;
  let environments;
  if (existing) {
    workspace = existing.workspace;
    const projects = await store.listProjects(workspace.id);
    project = projects.find((candidate) => candidate.status === "active") ?? projects[0];
    if (!project) throw new Error("Reliability workspace has no project.");
    environments = await store.listEnvironments(workspace.id, project.id);
  } else {
    const graph = await store.createWorkspace({
      ownerUserId: identity.userId,
      ownerEmail: identity.email,
      ownerDisplayName: identity.displayName,
      workspaceName: "Reliability Workspace",
      projectName: "Production Gate",
      legacyWorkspaceId: `user:${identity.userId}`,
    });
    workspace = graph.workspace;
    project = graph.project;
    environments = graph.environments;
  }

  const environment = environments.find((candidate) => candidate.kind === "production") ?? environments[0];
  if (!environment) throw new Error("Reliability project has no environment.");

  response.cookies.set(WORKSPACE_COOKIE, workspace.id, cookieOptions);
  response.cookies.set(PROJECT_COOKIE, project.id, cookieOptions);
  response.cookies.set(ENVIRONMENT_COOKIE, environment.id, cookieOptions);
  return response;
}

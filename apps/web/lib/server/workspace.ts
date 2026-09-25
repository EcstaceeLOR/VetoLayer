import { cookies } from "next/headers";
import type { Project, ProjectEnvironment, Workspace, WorkspaceMember } from "../workspace-model";
import { createSupabaseServerClient, isSupabaseAuthConfigured } from "../supabase/server";
import { getWorkspaceStore } from "./workspace-store";

export const WORKSPACE_COOKIE = "vl_workspace";
export const PROJECT_COOKIE = "vl_project";
export const ENVIRONMENT_COOKIE = "vl_environment";

export type AuthenticatedIdentity = {
  userId: string;
  email?: string;
  displayName?: string;
};

export type WorkspaceContext = AuthenticatedIdentity & {
  workspaceId: string;
  projectId: string;
  environmentId: string;
  label: string;
  role: WorkspaceMember["role"];
  workspace: Workspace;
  project: Project;
  environment: ProjectEnvironment;
  availableWorkspaces: Array<{ workspace: Workspace; membership: WorkspaceMember }>;
  availableProjects: Project[];
  availableEnvironments: ProjectEnvironment[];
};

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  if (!isSupabaseAuthConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const email = user.email?.trim() || undefined;
  const rawDisplayName = user.user_metadata?.display_name;
  const displayName = typeof rawDisplayName === "string" && rawDisplayName.trim()
    ? rawDisplayName.trim()
    : undefined;
  return {
    userId: user.id,
    ...(email ? { email } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

export async function getAuthenticatedWorkspace(): Promise<WorkspaceContext | null> {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return null;

  const { store } = getWorkspaceStore();
  const memberships = (await store.listWorkspacesForUser(identity.userId))
    .filter(({ workspace }) => workspace.status === "active");
  if (!memberships.length) return null;

  const cookieStore = await cookies();
  const preferredWorkspaceId = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const selectedEntry = memberships.find(({ workspace }) => workspace.id === preferredWorkspaceId) ?? memberships[0];
  if (!selectedEntry) return null;

  const projects = await store.listProjects(selectedEntry.workspace.id);
  if (!projects.length) return null;
  const preferredProjectId = cookieStore.get(PROJECT_COOKIE)?.value;
  const project = projects.find((candidate) => candidate.id === preferredProjectId) ?? projects[0];
  if (!project || project.status !== "active") return null;

  const environments = await store.listEnvironments(selectedEntry.workspace.id, project.id);
  if (!environments.length) return null;
  const preferredEnvironmentId = cookieStore.get(ENVIRONMENT_COOKIE)?.value;
  const environment = environments.find((candidate) => candidate.id === preferredEnvironmentId)
    ?? environments.find((candidate) => candidate.kind === "production")
    ?? environments[0];
  if (!environment || environment.status !== "active") return null;

  return {
    ...identity,
    workspaceId: selectedEntry.workspace.id,
    projectId: project.id,
    environmentId: environment.id,
    label: selectedEntry.workspace.name,
    role: selectedEntry.membership.role,
    workspace: selectedEntry.workspace,
    project,
    environment,
    availableWorkspaces: memberships,
    availableProjects: projects,
    availableEnvironments: environments,
  };
}

/** Legacy identifier used before Issue #54; retained only for migration. */
export function workspaceIdForUser(userId: string) {
  const normalized = userId.trim();
  if (!normalized) throw new Error("userId is required to derive a workspace");
  return `user:${normalized}`;
}

export function workspaceLabelFromEmail(email: string) {
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return "Personal workspace";
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return words.length ? `${words.join(" ")} Workspace` : "Personal workspace";
}

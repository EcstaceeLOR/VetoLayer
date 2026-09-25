export type WorkspaceRole = "owner" | "admin" | "reviewer" | "member";

export type WorkspacePermission =
  | "workspace.manage"
  | "workspace.archive"
  | "members.manage"
  | "projects.manage"
  | "environments.manage"
  | "policies.read"
  | "policies.write"
  | "integrations.read"
  | "integrations.write"
  | "decisions.read"
  | "reviews.read"
  | "reviews.resolve";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived";
  legacyWorkspaceId?: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type ProjectEnvironment = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  slug: string;
  kind: "development" | "staging" | "production" | "custom";
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMember = {
  workspaceId: string;
  userId: string;
  email?: string;
  displayName?: string;
  role: WorkspaceRole;
  status: "active";
  joinedAt: string;
};

export type WorkspaceInvitation = {
  id: string;
  workspaceId: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  tokenHash: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedByUserId: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
};

export type ProductScope = {
  workspaceId: string;
  projectId: string;
  environmentId: string;
};

export type ResolvedProductScope = ProductScope & {
  workspace: Workspace;
  project: Project;
  environment: ProjectEnvironment;
  member: WorkspaceMember;
};

const rolePermissions: Record<WorkspaceRole, ReadonlySet<WorkspacePermission>> = {
  owner: new Set<WorkspacePermission>([
    "workspace.manage",
    "workspace.archive",
    "members.manage",
    "projects.manage",
    "environments.manage",
    "policies.read",
    "policies.write",
    "integrations.read",
    "integrations.write",
    "decisions.read",
    "reviews.read",
    "reviews.resolve",
  ]),
  admin: new Set<WorkspacePermission>([
    "workspace.manage",
    "members.manage",
    "projects.manage",
    "environments.manage",
    "policies.read",
    "policies.write",
    "integrations.read",
    "integrations.write",
    "decisions.read",
    "reviews.read",
    "reviews.resolve",
  ]),
  reviewer: new Set<WorkspacePermission>([
    "policies.read",
    "integrations.read",
    "decisions.read",
    "reviews.read",
    "reviews.resolve",
  ]),
  member: new Set<WorkspacePermission>([
    "policies.read",
    "integrations.read",
    "decisions.read",
    "reviews.read",
  ]),
};

export function hasWorkspacePermission(role: WorkspaceRole, permission: WorkspacePermission) {
  return rolePermissions[role].has(permission);
}

export function assertWorkspacePermission(role: WorkspaceRole, permission: WorkspacePermission) {
  if (!hasWorkspacePermission(role, permission)) {
    const error = new Error(`Role ${role} cannot ${permission}`);
    error.name = "WorkspaceAuthorizationError";
    throw error;
  }
}

export function canAssignWorkspaceRole(actorRole: WorkspaceRole, nextRole: WorkspaceRole) {
  if (actorRole === "owner") return true;
  if (actorRole !== "admin") return false;
  return nextRole === "reviewer" || nextRole === "member";
}

export function slugifyWorkspaceName(value: string, fallback = "workspace") {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function normalizeEntityName(value: string, maxLength = 80) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function isProjectWritable(project: Project) {
  return project.status === "active";
}

import { randomUUID } from "node:crypto";
import type {
  Project,
  ProjectEnvironment,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from "../workspace-model";
import { normalizeEntityName, slugifyWorkspaceName } from "../workspace-model";
import { readServerEnvironment } from "./env";

export type CreateWorkspaceInput = {
  ownerUserId: string;
  ownerEmail?: string;
  ownerDisplayName?: string;
  workspaceName: string;
  projectName: string;
  environments?: Array<{ name: string; kind: ProjectEnvironment["kind"] }>;
  legacyWorkspaceId?: string;
};

export type WorkspaceStore = {
  listWorkspacesForUser(userId: string): Promise<Array<{ workspace: Workspace; membership: WorkspaceMember }>>;
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  getMembership(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  listProjects(workspaceId: string, includeArchived?: boolean): Promise<Project[]>;
  getProject(workspaceId: string, projectId: string): Promise<Project | null>;
  listEnvironments(workspaceId: string, projectId: string, includeArchived?: boolean): Promise<ProjectEnvironment[]>;
  getEnvironment(workspaceId: string, projectId: string, environmentId: string): Promise<ProjectEnvironment | null>;
  createWorkspace(input: CreateWorkspaceInput): Promise<{
    workspace: Workspace;
    project: Project;
    environments: ProjectEnvironment[];
    membership: WorkspaceMember;
  }>;
  renameWorkspace(workspaceId: string, name: string): Promise<Workspace>;
  archiveWorkspace(workspaceId: string): Promise<void>;
  createProject(workspaceId: string, name: string): Promise<Project>;
  renameProject(workspaceId: string, projectId: string, name: string): Promise<Project>;
  archiveProject(workspaceId: string, projectId: string): Promise<void>;
  createEnvironment(workspaceId: string, projectId: string, name: string, kind: ProjectEnvironment["kind"]): Promise<ProjectEnvironment>;
  renameEnvironment(workspaceId: string, projectId: string, environmentId: string, name: string): Promise<ProjectEnvironment>;
  archiveEnvironment(workspaceId: string, projectId: string, environmentId: string): Promise<void>;
  upsertMember(member: WorkspaceMember): Promise<void>;
  updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void>;
  removeMember(workspaceId: string, userId: string): Promise<void>;
  listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]>;
  saveInvitation(invitation: WorkspaceInvitation): Promise<void>;
  getInvitationByTokenHash(tokenHash: string): Promise<WorkspaceInvitation | null>;
  updateInvitation(invitation: WorkspaceInvitation): Promise<void>;
};

const memoryWorkspaces = new Map<string, Workspace>();
const memoryMembers = new Map<string, WorkspaceMember>();
const memoryProjects = new Map<string, Project>();
const memoryEnvironments = new Map<string, ProjectEnvironment>();
const memoryInvitations = new Map<string, WorkspaceInvitation>();

function nowIso() {
  return new Date().toISOString();
}

function memberKey(workspaceId: string, userId: string) {
  return `${workspaceId}:${userId}`;
}

function buildWorkspaceGraph(input: CreateWorkspaceInput) {
  const now = nowIso();
  const workspaceId = `ws_${randomUUID()}`;
  const projectId = `prj_${randomUUID()}`;
  const workspaceName = normalizeEntityName(input.workspaceName);
  const projectName = normalizeEntityName(input.projectName);

  const workspace: Workspace = {
    id: workspaceId,
    name: workspaceName,
    slug: slugifyWorkspaceName(workspaceName),
    status: "active",
    ...(input.legacyWorkspaceId ? { legacyWorkspaceId: input.legacyWorkspaceId } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const project: Project = {
    id: projectId,
    workspaceId,
    name: projectName,
    slug: slugifyWorkspaceName(projectName, "project"),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  const definitions = input.environments?.length
    ? input.environments
    : [
        { name: "Development", kind: "development" as const },
        { name: "Staging", kind: "staging" as const },
        { name: "Production", kind: "production" as const },
      ];
  const environments = definitions.map((definition): ProjectEnvironment => {
    const name = normalizeEntityName(definition.name, 60);
    return {
      id: `env_${randomUUID()}`,
      workspaceId,
      projectId,
      name,
      slug: slugifyWorkspaceName(name, "environment"),
      kind: definition.kind,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
  });
  const membership: WorkspaceMember = {
    workspaceId,
    userId: input.ownerUserId,
    ...(input.ownerEmail ? { email: input.ownerEmail } : {}),
    ...(input.ownerDisplayName ? { displayName: input.ownerDisplayName } : {}),
    role: "owner",
    status: "active",
    joinedAt: now,
  };
  return { workspace, project, environments, membership };
}

export function createMemoryWorkspaceStore(): WorkspaceStore {
  function getProject(workspaceId: string, projectId: string) {
    const project = memoryProjects.get(projectId);
    return project?.workspaceId === workspaceId ? project : null;
  }
  function getEnvironment(workspaceId: string, projectId: string, environmentId: string) {
    const environment = memoryEnvironments.get(environmentId);
    return environment?.workspaceId === workspaceId && environment.projectId === projectId ? environment : null;
  }

  return {
    async listWorkspacesForUser(userId) {
      return [...memoryMembers.values()]
        .filter((member) => member.userId === userId)
        .flatMap((membership) => {
          const workspace = memoryWorkspaces.get(membership.workspaceId);
          return workspace ? [{ workspace, membership }] : [];
        })
        .sort((left, right) => left.workspace.name.localeCompare(right.workspace.name));
    },
    async getWorkspace(workspaceId) { return memoryWorkspaces.get(workspaceId) ?? null; },
    async getMembership(workspaceId, userId) { return memoryMembers.get(memberKey(workspaceId, userId)) ?? null; },
    async listMembers(workspaceId) { return [...memoryMembers.values()].filter((member) => member.workspaceId === workspaceId); },
    async listProjects(workspaceId, includeArchived = false) {
      return [...memoryProjects.values()].filter((project) => project.workspaceId === workspaceId && (includeArchived || project.status === "active"));
    },
    async getProject(workspaceId, projectId) { return getProject(workspaceId, projectId); },
    async listEnvironments(workspaceId, projectId, includeArchived = false) {
      return [...memoryEnvironments.values()].filter((environment) =>
        environment.workspaceId === workspaceId && environment.projectId === projectId && (includeArchived || environment.status === "active"));
    },
    async getEnvironment(workspaceId, projectId, environmentId) { return getEnvironment(workspaceId, projectId, environmentId); },
    async createWorkspace(input) {
      const graph = buildWorkspaceGraph(input);
      memoryWorkspaces.set(graph.workspace.id, graph.workspace);
      memoryProjects.set(graph.project.id, graph.project);
      graph.environments.forEach((environment) => memoryEnvironments.set(environment.id, environment));
      memoryMembers.set(memberKey(graph.workspace.id, graph.membership.userId), graph.membership);
      return graph;
    },
    async renameWorkspace(workspaceId, name) {
      const current = memoryWorkspaces.get(workspaceId);
      if (!current) throw new Error("Workspace not found");
      const normalized = normalizeEntityName(name);
      const updated = { ...current, name: normalized, slug: slugifyWorkspaceName(normalized), updatedAt: nowIso() };
      memoryWorkspaces.set(workspaceId, updated);
      return updated;
    },
    async archiveWorkspace(workspaceId) {
      const current = memoryWorkspaces.get(workspaceId);
      if (!current) throw new Error("Workspace not found");
      memoryWorkspaces.set(workspaceId, { ...current, status: "archived", updatedAt: nowIso() });
    },
    async createProject(workspaceId, name) {
      const normalized = normalizeEntityName(name);
      const now = nowIso();
      const project: Project = {
        id: `prj_${randomUUID()}`,
        workspaceId,
        name: normalized,
        slug: slugifyWorkspaceName(normalized, "project"),
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      memoryProjects.set(project.id, project);
      return project;
    },
    async renameProject(workspaceId, projectId, name) {
      const current = getProject(workspaceId, projectId);
      if (!current) throw new Error("Project not found");
      const normalized = normalizeEntityName(name);
      const updated = { ...current, name: normalized, slug: slugifyWorkspaceName(normalized, "project"), updatedAt: nowIso() };
      memoryProjects.set(projectId, updated);
      return updated;
    },
    async archiveProject(workspaceId, projectId) {
      const current = getProject(workspaceId, projectId);
      if (!current) throw new Error("Project not found");
      memoryProjects.set(projectId, { ...current, status: "archived", updatedAt: nowIso() });
    },
    async createEnvironment(workspaceId, projectId, name, kind) {
      const normalized = normalizeEntityName(name, 60);
      const now = nowIso();
      const environment: ProjectEnvironment = {
        id: `env_${randomUUID()}`,
        workspaceId,
        projectId,
        name: normalized,
        slug: slugifyWorkspaceName(normalized, "environment"),
        kind,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      memoryEnvironments.set(environment.id, environment);
      return environment;
    },
    async renameEnvironment(workspaceId, projectId, environmentId, name) {
      const current = getEnvironment(workspaceId, projectId, environmentId);
      if (!current) throw new Error("Environment not found");
      const normalized = normalizeEntityName(name, 60);
      const updated = { ...current, name: normalized, slug: slugifyWorkspaceName(normalized, "environment"), updatedAt: nowIso() };
      memoryEnvironments.set(environmentId, updated);
      return updated;
    },
    async archiveEnvironment(workspaceId, projectId, environmentId) {
      const current = getEnvironment(workspaceId, projectId, environmentId);
      if (!current) throw new Error("Environment not found");
      memoryEnvironments.set(environmentId, { ...current, status: "archived", updatedAt: nowIso() });
    },
    async upsertMember(member) { memoryMembers.set(memberKey(member.workspaceId, member.userId), member); },
    async updateMemberRole(workspaceId, userId, role) {
      const current = memoryMembers.get(memberKey(workspaceId, userId));
      if (!current) throw new Error("Member not found");
      memoryMembers.set(memberKey(workspaceId, userId), { ...current, role });
    },
    async removeMember(workspaceId, userId) { memoryMembers.delete(memberKey(workspaceId, userId)); },
    async listInvitations(workspaceId) { return [...memoryInvitations.values()].filter((invite) => invite.workspaceId === workspaceId); },
    async saveInvitation(invitation) { memoryInvitations.set(invitation.id, invitation); },
    async getInvitationByTokenHash(tokenHash) { return [...memoryInvitations.values()].find((invite) => invite.tokenHash === tokenHash) ?? null; },
    async updateInvitation(invitation) { memoryInvitations.set(invitation.id, invitation); },
  };
}

type Row = Record<string, unknown>;

function supabaseHeaders(serviceRoleKey: string) {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
}

function workspaceFromRow(row: Row): Workspace {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    status: row.status as Workspace["status"],
    ...(row.legacy_workspace_id ? { legacyWorkspaceId: String(row.legacy_workspace_id) } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
function memberFromRow(row: Row): WorkspaceMember {
  return {
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    ...(row.email ? { email: String(row.email) } : {}),
    ...(row.display_name ? { displayName: String(row.display_name) } : {}),
    role: row.role as WorkspaceRole,
    status: "active",
    joinedAt: String(row.joined_at),
  };
}
function projectFromRow(row: Row): Project {
  return {
    id: String(row.id), workspaceId: String(row.workspace_id), name: String(row.name), slug: String(row.slug),
    status: row.status as Project["status"], createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}
function environmentFromRow(row: Row): ProjectEnvironment {
  return {
    id: String(row.id), workspaceId: String(row.workspace_id), projectId: String(row.project_id), name: String(row.name), slug: String(row.slug),
    kind: row.kind as ProjectEnvironment["kind"], status: row.status as ProjectEnvironment["status"], createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}
function invitationFromRow(row: Row): WorkspaceInvitation {
  return {
    id: String(row.id), workspaceId: String(row.workspace_id), email: String(row.email), role: row.role as WorkspaceInvitation["role"],
    tokenHash: String(row.token_hash), status: row.status as WorkspaceInvitation["status"], invitedByUserId: String(row.invited_by_user_id),
    expiresAt: String(row.expires_at), createdAt: String(row.created_at), ...(row.accepted_at ? { acceptedAt: String(row.accepted_at) } : {}),
  };
}

export function createSupabaseWorkspaceStore(
  config: { url: string; serviceRoleKey: string },
  fetchImpl: typeof fetch = fetch,
): WorkspaceStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = supabaseHeaders(config.serviceRoleKey);

  async function request(path: string, init?: RequestInit) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
      const error = new Error(`Workspace persistence request failed with status ${response.status}.`);
      error.name = "WorkspacePersistenceError";
      throw error;
    }
    return response;
  }
  async function rows(path: string) {
    return await (await request(path)).json() as Row[];
  }
  async function getProject(workspaceId: string, projectId: string) {
    const query = new URLSearchParams({
      select: "id,workspace_id,name,slug,status,created_at,updated_at",
      workspace_id: `eq.${workspaceId}`,
      id: `eq.${projectId}`,
      limit: "1",
    });
    return (await rows(`vetolayer_projects?${query}`)).map(projectFromRow)[0] ?? null;
  }
  async function getEnvironment(workspaceId: string, projectId: string, environmentId: string) {
    const query = new URLSearchParams({
      select: "id,workspace_id,project_id,name,slug,kind,status,created_at,updated_at",
      workspace_id: `eq.${workspaceId}`,
      project_id: `eq.${projectId}`,
      id: `eq.${environmentId}`,
      limit: "1",
    });
    return (await rows(`vetolayer_environments?${query}`)).map(environmentFromRow)[0] ?? null;
  }

  return {
    async listWorkspacesForUser(userId) {
      const memberQuery = new URLSearchParams({
        select: "workspace_id,user_id,email,display_name,role,joined_at",
        user_id: `eq.${userId}`,
      });
      const memberships = (await rows(`vetolayer_workspace_members?${memberQuery}`)).map(memberFromRow);
      if (!memberships.length) return [];
      const workspaceQuery = new URLSearchParams({
        select: "id,name,slug,status,legacy_workspace_id,created_at,updated_at",
        id: `in.(${memberships.map((membership) => membership.workspaceId).join(",")})`,
        order: "name.asc",
      });
      const workspaces = new Map((await rows(`vetolayer_workspaces?${workspaceQuery}`)).map(workspaceFromRow).map((workspace) => [workspace.id, workspace]));
      return memberships.flatMap((membership) => {
        const workspace = workspaces.get(membership.workspaceId);
        return workspace ? [{ workspace, membership }] : [];
      });
    },
    async getWorkspace(workspaceId) {
      const query = new URLSearchParams({
        select: "id,name,slug,status,legacy_workspace_id,created_at,updated_at",
        id: `eq.${workspaceId}`,
        limit: "1",
      });
      return (await rows(`vetolayer_workspaces?${query}`)).map(workspaceFromRow)[0] ?? null;
    },
    async getMembership(workspaceId, userId) {
      const query = new URLSearchParams({
        select: "workspace_id,user_id,email,display_name,role,joined_at",
        workspace_id: `eq.${workspaceId}`,
        user_id: `eq.${userId}`,
        limit: "1",
      });
      return (await rows(`vetolayer_workspace_members?${query}`)).map(memberFromRow)[0] ?? null;
    },
    async listMembers(workspaceId) {
      const query = new URLSearchParams({
        select: "workspace_id,user_id,email,display_name,role,joined_at",
        workspace_id: `eq.${workspaceId}`,
        order: "joined_at.asc",
      });
      return (await rows(`vetolayer_workspace_members?${query}`)).map(memberFromRow);
    },
    async listProjects(workspaceId, includeArchived = false) {
      const query = new URLSearchParams({
        select: "id,workspace_id,name,slug,status,created_at,updated_at",
        workspace_id: `eq.${workspaceId}`,
        order: "created_at.asc",
      });
      if (!includeArchived) query.set("status", "eq.active");
      return (await rows(`vetolayer_projects?${query}`)).map(projectFromRow);
    },
    async getProject(workspaceId, projectId) { return getProject(workspaceId, projectId); },
    async listEnvironments(workspaceId, projectId, includeArchived = false) {
      const query = new URLSearchParams({
        select: "id,workspace_id,project_id,name,slug,kind,status,created_at,updated_at",
        workspace_id: `eq.${workspaceId}`,
        project_id: `eq.${projectId}`,
        order: "created_at.asc",
      });
      if (!includeArchived) query.set("status", "eq.active");
      return (await rows(`vetolayer_environments?${query}`)).map(environmentFromRow);
    },
    async getEnvironment(workspaceId, projectId, environmentId) { return getEnvironment(workspaceId, projectId, environmentId); },
    async createWorkspace(input) {
      const graph = buildWorkspaceGraph(input);
      await request("vetolayer_workspaces", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: graph.workspace.id, name: graph.workspace.name, slug: graph.workspace.slug, status: graph.workspace.status,
          legacy_workspace_id: graph.workspace.legacyWorkspaceId ?? null,
          created_at: graph.workspace.createdAt, updated_at: graph.workspace.updatedAt,
        }),
      });
      await request("vetolayer_workspace_members", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          workspace_id: graph.membership.workspaceId, user_id: graph.membership.userId,
          email: graph.membership.email ?? null, display_name: graph.membership.displayName ?? null,
          role: graph.membership.role, joined_at: graph.membership.joinedAt,
        }),
      });
      await request("vetolayer_projects", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: graph.project.id, workspace_id: graph.project.workspaceId, name: graph.project.name,
          slug: graph.project.slug, status: graph.project.status, created_at: graph.project.createdAt, updated_at: graph.project.updatedAt,
        }),
      });
      await request("vetolayer_environments", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify(graph.environments.map((environment) => ({
          id: environment.id, workspace_id: environment.workspaceId, project_id: environment.projectId,
          name: environment.name, slug: environment.slug, kind: environment.kind, status: environment.status,
          created_at: environment.createdAt, updated_at: environment.updatedAt,
        }))),
      });
      return graph;
    },
    async renameWorkspace(workspaceId, name) {
      const normalized = normalizeEntityName(name);
      await request(`vetolayer_workspaces?id=eq.${encodeURIComponent(workspaceId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ name: normalized, slug: slugifyWorkspaceName(normalized), updated_at: nowIso() }),
      });
      const workspace = await this.getWorkspace(workspaceId);
      if (!workspace) throw new Error("Workspace not found after rename");
      return workspace;
    },
    async archiveWorkspace(workspaceId) {
      await request(`vetolayer_workspaces?id=eq.${encodeURIComponent(workspaceId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "archived", updated_at: nowIso() }),
      });
    },
    async createProject(workspaceId, name) {
      const normalized = normalizeEntityName(name);
      const now = nowIso();
      const project: Project = {
        id: `prj_${randomUUID()}`, workspaceId, name: normalized, slug: slugifyWorkspaceName(normalized, "project"),
        status: "active", createdAt: now, updatedAt: now,
      };
      await request("vetolayer_projects", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ id: project.id, workspace_id: workspaceId, name: project.name, slug: project.slug, status: project.status, created_at: now, updated_at: now }),
      });
      return project;
    },
    async renameProject(workspaceId, projectId, name) {
      const normalized = normalizeEntityName(name);
      await request(`vetolayer_projects?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(projectId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ name: normalized, slug: slugifyWorkspaceName(normalized, "project"), updated_at: nowIso() }),
      });
      const project = await getProject(workspaceId, projectId);
      if (!project) throw new Error("Project not found after rename");
      return project;
    },
    async archiveProject(workspaceId, projectId) {
      await request(`vetolayer_projects?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(projectId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "archived", updated_at: nowIso() }),
      });
    },
    async createEnvironment(workspaceId, projectId, name, kind) {
      const normalized = normalizeEntityName(name, 60);
      const now = nowIso();
      const environment: ProjectEnvironment = {
        id: `env_${randomUUID()}`, workspaceId, projectId, name: normalized,
        slug: slugifyWorkspaceName(normalized, "environment"), kind, status: "active", createdAt: now, updatedAt: now,
      };
      await request("vetolayer_environments", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: environment.id, workspace_id: workspaceId, project_id: projectId, name: environment.name,
          slug: environment.slug, kind, status: "active", created_at: now, updated_at: now,
        }),
      });
      return environment;
    },
    async renameEnvironment(workspaceId, projectId, environmentId, name) {
      const normalized = normalizeEntityName(name, 60);
      await request(`vetolayer_environments?workspace_id=eq.${encodeURIComponent(workspaceId)}&project_id=eq.${encodeURIComponent(projectId)}&id=eq.${encodeURIComponent(environmentId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ name: normalized, slug: slugifyWorkspaceName(normalized, "environment"), updated_at: nowIso() }),
      });
      const environment = await getEnvironment(workspaceId, projectId, environmentId);
      if (!environment) throw new Error("Environment not found after rename");
      return environment;
    },
    async archiveEnvironment(workspaceId, projectId, environmentId) {
      await request(`vetolayer_environments?workspace_id=eq.${encodeURIComponent(workspaceId)}&project_id=eq.${encodeURIComponent(projectId)}&id=eq.${encodeURIComponent(environmentId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "archived", updated_at: nowIso() }),
      });
    },
    async upsertMember(member) {
      await request("vetolayer_workspace_members", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          workspace_id: member.workspaceId, user_id: member.userId, email: member.email ?? null,
          display_name: member.displayName ?? null, role: member.role, joined_at: member.joinedAt,
        }),
      });
    },
    async updateMemberRole(workspaceId, userId, role) {
      await request(`vetolayer_workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&user_id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ role }),
      });
    },
    async removeMember(workspaceId, userId) {
      await request(`vetolayer_workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&user_id=eq.${encodeURIComponent(userId)}`, {
        method: "DELETE", headers: { Prefer: "return=minimal" },
      });
    },
    async listInvitations(workspaceId) {
      const query = new URLSearchParams({
        select: "id,workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at,created_at,accepted_at",
        workspace_id: `eq.${workspaceId}`,
        order: "created_at.desc",
      });
      return (await rows(`vetolayer_workspace_invitations?${query}`)).map(invitationFromRow);
    },
    async saveInvitation(invitation) {
      await request("vetolayer_workspace_invitations", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: invitation.id, workspace_id: invitation.workspaceId, email: invitation.email, role: invitation.role,
          token_hash: invitation.tokenHash, status: invitation.status, invited_by_user_id: invitation.invitedByUserId,
          expires_at: invitation.expiresAt, created_at: invitation.createdAt, accepted_at: invitation.acceptedAt ?? null,
        }),
      });
    },
    async getInvitationByTokenHash(tokenHash) {
      const query = new URLSearchParams({
        select: "id,workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at,created_at,accepted_at",
        token_hash: `eq.${tokenHash}`,
        limit: "1",
      });
      return (await rows(`vetolayer_workspace_invitations?${query}`)).map(invitationFromRow)[0] ?? null;
    },
    async updateInvitation(invitation) {
      await request(`vetolayer_workspace_invitations?id=eq.${encodeURIComponent(invitation.id)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: invitation.status, accepted_at: invitation.acceptedAt ?? null, role: invitation.role, expires_at: invitation.expiresAt }),
      });
    },
  };
}

const memoryStore = createMemoryWorkspaceStore();

export function getWorkspaceStore(): { store: WorkspaceStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return {
      store: createSupabaseWorkspaceStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey }),
      persistence: "supabase",
    };
  }
  return { store: memoryStore, persistence: "memory" };
}

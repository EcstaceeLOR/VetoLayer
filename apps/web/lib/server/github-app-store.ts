import { createHash } from "node:crypto";
import type { ProductScope } from "../workspace-model";
import { readServerEnvironment } from "./env";
import type { GitHubInstallationMetadata, GitHubInstallationRepository } from "./github-app";

export type GitHubConnectionState = "ready" | "suspended" | "revoked" | "permission-error" | "disconnected";

export type StoredGitHubInstallation = ProductScope & {
  id: string;
  installationId: number;
  accountId: number;
  accountLogin: string;
  accountType: string;
  repositorySelection: "all" | "selected";
  permissions: Record<string, string>;
  state: GitHubConnectionState;
  installedByUserId: string;
  lastSyncAt?: string;
  lastEventAt?: string;
  updatedAt: string;
};

export type StoredGitHubRepository = {
  connectionId: string;
  repositoryId: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  connected: boolean;
  updatedAt: string;
};

export type GitHubInstallState = ProductScope & {
  stateHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

export type GitHubAppStore = {
  saveInstallState(record: GitHubInstallState): Promise<void>;
  consumeInstallState(stateHash: string): Promise<GitHubInstallState | null>;
  getInstallation(scope: ProductScope): Promise<StoredGitHubInstallation | null>;
  listByInstallationId(installationId: number): Promise<StoredGitHubInstallation[]>;
  saveInstallation(record: StoredGitHubInstallation): Promise<void>;
  updateInstallationState(installationId: number, state: GitHubConnectionState, lastEventAt?: string): Promise<void>;
  deleteInstallation(scope: ProductScope): Promise<void>;
  listRepositories(connectionId: string): Promise<StoredGitHubRepository[]>;
  replaceRepositories(connectionId: string, repositories: GitHubInstallationRepository[], now: string): Promise<void>;
  setConnectedRepositories(connectionId: string, repositoryIds: number[], now: string): Promise<void>;
  claimWebhookDelivery(deliveryId: string, event: string, installationId?: number): Promise<boolean>;
};

export function githubConnectionId(scope: ProductScope) {
  return `github_${createHash("sha256").update(`${scope.workspaceId}:${scope.projectId}:${scope.environmentId}`).digest("hex").slice(0, 32)}`;
}

export function createStoredGitHubInstallation(input: {
  scope: ProductScope;
  metadata: GitHubInstallationMetadata;
  installedByUserId: string;
  state: GitHubConnectionState;
  now: string;
}): StoredGitHubInstallation {
  return {
    id: githubConnectionId(input.scope),
    ...input.scope,
    installationId: input.metadata.installationId,
    accountId: input.metadata.accountId,
    accountLogin: input.metadata.accountLogin,
    accountType: input.metadata.accountType,
    repositorySelection: input.metadata.repositorySelection,
    permissions: input.metadata.permissions,
    state: input.state,
    installedByUserId: input.installedByUserId,
    lastSyncAt: input.now,
    updatedAt: input.now,
  };
}

const memoryInstallStates = new Map<string, GitHubInstallState>();
const memoryInstallations = new Map<string, StoredGitHubInstallation>();
const memoryRepositories = new Map<string, StoredGitHubRepository>();
const memoryDeliveries = new Set<string>();

function scopeMatches(record: ProductScope, scope: ProductScope) {
  return record.workspaceId === scope.workspaceId && record.projectId === scope.projectId && record.environmentId === scope.environmentId;
}

export function createMemoryGitHubAppStore(): GitHubAppStore {
  return {
    async saveInstallState(record) { memoryInstallStates.set(record.stateHash, record); },
    async consumeInstallState(stateHash) {
      const record = memoryInstallStates.get(stateHash) ?? null;
      memoryInstallStates.delete(stateHash);
      return record;
    },
    async getInstallation(scope) { return [...memoryInstallations.values()].find((record) => scopeMatches(record, scope)) ?? null; },
    async listByInstallationId(installationId) { return [...memoryInstallations.values()].filter((record) => record.installationId === installationId); },
    async saveInstallation(record) { memoryInstallations.set(record.id, record); },
    async updateInstallationState(installationId, state, lastEventAt) {
      for (const [id, record] of memoryInstallations) {
        if (record.installationId !== installationId) continue;
        memoryInstallations.set(id, { ...record, state, ...(lastEventAt ? { lastEventAt } : {}), updatedAt: lastEventAt ?? new Date().toISOString() });
      }
    },
    async deleteInstallation(scope) {
      const record = [...memoryInstallations.values()].find((candidate) => scopeMatches(candidate, scope));
      if (!record) return;
      memoryInstallations.delete(record.id);
      for (const [key, repo] of memoryRepositories) if (repo.connectionId === record.id) memoryRepositories.delete(key);
    },
    async listRepositories(connectionId) {
      return [...memoryRepositories.values()].filter((repo) => repo.connectionId === connectionId).sort((a, b) => a.fullName.localeCompare(b.fullName));
    },
    async replaceRepositories(connectionId, repositories, now) {
      const existing = new Map((await this.listRepositories(connectionId)).map((repo) => [repo.repositoryId, repo]));
      for (const [key, repo] of memoryRepositories) if (repo.connectionId === connectionId) memoryRepositories.delete(key);
      for (const repo of repositories) {
        const previous = existing.get(repo.repositoryId);
        const record: StoredGitHubRepository = { connectionId, ...repo, connected: previous?.connected ?? true, updatedAt: now };
        memoryRepositories.set(`${connectionId}:${repo.repositoryId}`, record);
      }
    },
    async setConnectedRepositories(connectionId, repositoryIds, now) {
      const selected = new Set(repositoryIds);
      for (const [key, repo] of memoryRepositories) {
        if (repo.connectionId !== connectionId) continue;
        memoryRepositories.set(key, { ...repo, connected: selected.has(repo.repositoryId), updatedAt: now });
      }
    },
    async claimWebhookDelivery(deliveryId) {
      if (memoryDeliveries.has(deliveryId)) return false;
      memoryDeliveries.add(deliveryId);
      return true;
    },
  };
}

function supabaseHeaders(serviceRoleKey: string) {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
}

export function createSupabaseGitHubAppStore(config: { url: string; serviceRoleKey: string }, fetchImpl: typeof fetch = fetch): GitHubAppStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = supabaseHeaders(config.serviceRoleKey);
  async function requireSuccess(response: Response, operation: string) {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    throw new Error(`GitHub App persistence ${operation} failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }
  async function readRows<T>(path: string) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, { headers, cache: "no-store" });
    await requireSuccess(response, "read");
    return await response.json() as T[];
  }
  function mapInstallation(row: Record<string, unknown>): StoredGitHubInstallation {
    return {
      id: String(row.id), workspaceId: String(row.workspace_id), projectId: String(row.project_id), environmentId: String(row.environment_id),
      installationId: Number(row.installation_id), accountId: Number(row.account_id), accountLogin: String(row.account_login), accountType: String(row.account_type),
      repositorySelection: row.repository_selection === "all" ? "all" : "selected", permissions: (row.permissions && typeof row.permissions === "object" ? row.permissions : {}) as Record<string, string>,
      state: String(row.state) as GitHubConnectionState, installedByUserId: String(row.installed_by_user_id),
      ...(row.last_sync_at ? { lastSyncAt: String(row.last_sync_at) } : {}), ...(row.last_event_at ? { lastEventAt: String(row.last_event_at) } : {}), updatedAt: String(row.updated_at),
    };
  }
  return {
    async saveInstallState(record) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_install_states`, { method: "POST", headers, body: JSON.stringify({ state_hash: record.stateHash, workspace_id: record.workspaceId, project_id: record.projectId, environment_id: record.environmentId, user_id: record.userId, expires_at: record.expiresAt, created_at: record.createdAt }) });
      await requireSuccess(response, "save install state");
    },
    async consumeInstallState(stateHash) {
      const rows = await readRows<Record<string, unknown>>(`vetolayer_github_install_states?state_hash=eq.${encodeURIComponent(stateHash)}&select=state_hash,workspace_id,project_id,environment_id,user_id,expires_at,created_at&limit=1`);
      const row = rows[0];
      if (!row) return null;
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_install_states?state_hash=eq.${encodeURIComponent(stateHash)}`, { method: "DELETE", headers });
      await requireSuccess(response, "consume install state");
      return { stateHash: String(row.state_hash), workspaceId: String(row.workspace_id), projectId: String(row.project_id), environmentId: String(row.environment_id), userId: String(row.user_id), expiresAt: String(row.expires_at), createdAt: String(row.created_at) };
    },
    async getInstallation(scope) {
      const query = new URLSearchParams({ workspace_id: `eq.${scope.workspaceId}`, project_id: `eq.${scope.projectId}`, environment_id: `eq.${scope.environmentId}`, select: "*", limit: "1" });
      const rows = await readRows<Record<string, unknown>>(`vetolayer_github_installations?${query}`);
      return rows[0] ? mapInstallation(rows[0]) : null;
    },
    async listByInstallationId(installationId) {
      return (await readRows<Record<string, unknown>>(`vetolayer_github_installations?installation_id=eq.${installationId}&select=*`)).map(mapInstallation);
    },
    async saveInstallation(record) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_installations`, {
        method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: record.id, workspace_id: record.workspaceId, project_id: record.projectId, environment_id: record.environmentId, installation_id: record.installationId, account_id: record.accountId, account_login: record.accountLogin, account_type: record.accountType, repository_selection: record.repositorySelection, permissions: record.permissions, state: record.state, installed_by_user_id: record.installedByUserId, last_sync_at: record.lastSyncAt ?? null, last_event_at: record.lastEventAt ?? null, updated_at: record.updatedAt }),
      });
      await requireSuccess(response, "save installation");
    },
    async updateInstallationState(installationId, state, lastEventAt) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_installations?installation_id=eq.${installationId}`, { method: "PATCH", headers, body: JSON.stringify({ state, ...(lastEventAt ? { last_event_at: lastEventAt } : {}), updated_at: lastEventAt ?? new Date().toISOString() }) });
      await requireSuccess(response, "update installation state");
    },
    async deleteInstallation(scope) {
      const query = new URLSearchParams({ workspace_id: `eq.${scope.workspaceId}`, project_id: `eq.${scope.projectId}`, environment_id: `eq.${scope.environmentId}` });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_installations?${query}`, { method: "DELETE", headers });
      await requireSuccess(response, "disconnect installation");
    },
    async listRepositories(connectionId) {
      const rows = await readRows<Record<string, unknown>>(`vetolayer_github_repositories?connection_id=eq.${encodeURIComponent(connectionId)}&select=*&order=full_name.asc`);
      return rows.map((row) => ({ connectionId: String(row.connection_id), repositoryId: Number(row.repository_id), owner: String(row.owner_login), name: String(row.name), fullName: String(row.full_name), private: row.is_private === true, defaultBranch: String(row.default_branch ?? "main"), connected: row.connected === true, updatedAt: String(row.updated_at) }));
    },
    async replaceRepositories(connectionId, repositories, now) {
      const existing = new Map((await this.listRepositories(connectionId)).map((repo) => [repo.repositoryId, repo.connected]));
      const deleteResponse = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_repositories?connection_id=eq.${encodeURIComponent(connectionId)}`, { method: "DELETE", headers });
      await requireSuccess(deleteResponse, "replace repositories");
      if (!repositories.length) return;
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_repositories`, { method: "POST", headers, body: JSON.stringify(repositories.map((repo) => ({ connection_id: connectionId, repository_id: repo.repositoryId, owner_login: repo.owner, name: repo.name, full_name: repo.fullName, is_private: repo.private, default_branch: repo.defaultBranch, connected: existing.get(repo.repositoryId) ?? true, updated_at: now }))) });
      await requireSuccess(response, "save repositories");
    },
    async setConnectedRepositories(connectionId, repositoryIds, now) {
      const repos = await this.listRepositories(connectionId);
      const selected = new Set(repositoryIds);
      for (const repo of repos) {
        const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_repositories?connection_id=eq.${encodeURIComponent(connectionId)}&repository_id=eq.${repo.repositoryId}`, { method: "PATCH", headers, body: JSON.stringify({ connected: selected.has(repo.repositoryId), updated_at: now }) });
        await requireSuccess(response, "update repository selection");
      }
    },
    async claimWebhookDelivery(deliveryId, event, installationId) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_webhook_deliveries`, { method: "POST", headers, body: JSON.stringify({ delivery_id: deliveryId, event, installation_id: installationId ?? null, received_at: new Date().toISOString() }) });
      if (response.status === 409) return false;
      await requireSuccess(response, "claim webhook delivery");
      return true;
    },
  };
}

const memoryStore = createMemoryGitHubAppStore();
export function getGitHubAppStore(): { store: GitHubAppStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return { store: createSupabaseGitHubAppStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey }), persistence: "supabase" };
  }
  return { store: memoryStore, persistence: "memory" };
}

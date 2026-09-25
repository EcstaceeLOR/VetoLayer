import type { GitHubInstallationInfo, GitHubRepositoryInfo } from "./github-app";
import { readServerEnvironment } from "./env";

export type GitHubConnectionStatus = "active" | "suspended" | "uninstalled" | "error";

export type StoredGitHubInstallation = {
  id: string;
  workspaceId: string;
  projectId: string;
  environmentId: string;
  installationId: number;
  accountLogin: string;
  accountId: number;
  accountType: string;
  accountUrl?: string;
  installationUrl?: string;
  repositorySelection: "all" | "selected";
  status: GitHubConnectionStatus;
  permissions: Record<string, string>;
  events: string[];
  repositories: GitHubRepositoryInfo[];
  connectedByUserId: string;
  suspendedAt?: string;
  lastSyncedAt?: string;
  lastEvent?: string;
  createdAt: string;
  updatedAt: string;
};

export type GitHubInstallationScope = {
  workspaceId: string;
  projectId: string;
  environmentId: string;
};

export type GitHubAppStore = {
  list(scope: GitHubInstallationScope): Promise<StoredGitHubInstallation[]>;
  get(scope: GitHubInstallationScope, installationId: number): Promise<StoredGitHubInstallation | null>;
  listByInstallationId(installationId: number): Promise<StoredGitHubInstallation[]>;
  save(record: StoredGitHubInstallation): Promise<void>;
  remove(scope: GitHubInstallationScope, installationId: number): Promise<void>;
};

const memory = new Map<string, StoredGitHubInstallation>();

export function githubInstallationRecordId(scope: GitHubInstallationScope, installationId: number) {
  return [scope.workspaceId, scope.projectId, scope.environmentId, `github-${installationId}`].join(":");
}

export function connectionFromGitHub(input: {
  scope: GitHubInstallationScope;
  installation: GitHubInstallationInfo;
  repositories: GitHubRepositoryInfo[];
  connectedByUserId: string;
  existing?: StoredGitHubInstallation | null;
  now?: string;
}): StoredGitHubInstallation {
  const now = input.now ?? new Date().toISOString();
  return {
    id: githubInstallationRecordId(input.scope, input.installation.id),
    ...input.scope,
    installationId: input.installation.id,
    accountLogin: input.installation.account.login,
    accountId: input.installation.account.id,
    accountType: input.installation.account.type,
    ...(input.installation.account.htmlUrl ? { accountUrl: input.installation.account.htmlUrl } : {}),
    ...(input.installation.htmlUrl ? { installationUrl: input.installation.htmlUrl } : {}),
    repositorySelection: input.installation.repositorySelection,
    status: input.installation.suspendedAt ? "suspended" : "active",
    permissions: Object.fromEntries(Object.entries(input.installation.permissions).map(([key, value]) => [key, String(value)])),
    events: [...input.installation.events],
    repositories: [...input.repositories].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    connectedByUserId: input.connectedByUserId,
    ...(input.installation.suspendedAt ? { suspendedAt: input.installation.suspendedAt } : {}),
    lastSyncedAt: now,
    ...(input.existing?.lastEvent ? { lastEvent: input.existing.lastEvent } : {}),
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function createMemoryGitHubAppStore(): GitHubAppStore {
  return {
    async list(scope) {
      return [...memory.values()]
        .filter((record) => record.workspaceId === scope.workspaceId && record.projectId === scope.projectId && record.environmentId === scope.environmentId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(scope, installationId) {
      return memory.get(githubInstallationRecordId(scope, installationId)) ?? null;
    },
    async listByInstallationId(installationId) {
      return [...memory.values()].filter((record) => record.installationId === installationId);
    },
    async save(record) {
      memory.set(record.id, record);
    },
    async remove(scope, installationId) {
      memory.delete(githubInstallationRecordId(scope, installationId));
    },
  };
}

type GitHubInstallationRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string;
  installation_id: number;
  account_login: string;
  account_id: number;
  account_type: string;
  account_url?: string | null;
  installation_url?: string | null;
  repository_selection: "all" | "selected";
  status: GitHubConnectionStatus;
  permissions?: Record<string, string> | null;
  events?: string[] | null;
  repositories?: GitHubRepositoryInfo[] | null;
  connected_by_user_id: string;
  suspended_at?: string | null;
  last_synced_at?: string | null;
  last_event?: string | null;
  created_at: string;
  updated_at: string;
};

function fromRow(row: GitHubInstallationRow): StoredGitHubInstallation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    installationId: Number(row.installation_id),
    accountLogin: row.account_login,
    accountId: Number(row.account_id),
    accountType: row.account_type,
    ...(row.account_url ? { accountUrl: row.account_url } : {}),
    ...(row.installation_url ? { installationUrl: row.installation_url } : {}),
    repositorySelection: row.repository_selection,
    status: row.status,
    permissions: row.permissions ?? {},
    events: row.events ?? [],
    repositories: row.repositories ?? [],
    connectedByUserId: row.connected_by_user_id,
    ...(row.suspended_at ? { suspendedAt: row.suspended_at } : {}),
    ...(row.last_synced_at ? { lastSyncedAt: row.last_synced_at } : {}),
    ...(row.last_event ? { lastEvent: row.last_event } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseGitHubAppStore(
  config: { url: string; serviceRoleKey: string },
  fetchImpl: typeof fetch = fetch,
): GitHubAppStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  async function requireSuccess(response: Response, operation: string) {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    throw new Error(`GitHub App persistence ${operation} failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  function scopeQuery(scope: GitHubInstallationScope) {
    return {
      workspace_id: `eq.${scope.workspaceId}`,
      project_id: `eq.${scope.projectId}`,
      environment_id: `eq.${scope.environmentId}`,
    };
  }

  return {
    async list(scope) {
      const query = new URLSearchParams({
        select: "*",
        ...scopeQuery(scope),
        order: "updated_at.desc",
      });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_installations?${query}`, { headers, cache: "no-store" });
      await requireSuccess(response, "list");
      return ((await response.json()) as GitHubInstallationRow[]).map(fromRow);
    },
    async get(scope, installationId) {
      const query = new URLSearchParams({
        select: "*",
        ...scopeQuery(scope),
        installation_id: `eq.${installationId}`,
        limit: "1",
      });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_installations?${query}`, { headers, cache: "no-store" });
      await requireSuccess(response, "get");
      const rows = await response.json() as GitHubInstallationRow[];
      return rows[0] ? fromRow(rows[0]) : null;
    },
    async listByInstallationId(installationId) {
      const query = new URLSearchParams({ select: "*", installation_id: `eq.${installationId}` });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_installations?${query}`, { headers, cache: "no-store" });
      await requireSuccess(response, "list by installation");
      return ((await response.json()) as GitHubInstallationRow[]).map(fromRow);
    },
    async save(record) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_installations`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: record.id,
          workspace_id: record.workspaceId,
          project_id: record.projectId,
          environment_id: record.environmentId,
          installation_id: record.installationId,
          account_login: record.accountLogin,
          account_id: record.accountId,
          account_type: record.accountType,
          account_url: record.accountUrl ?? null,
          installation_url: record.installationUrl ?? null,
          repository_selection: record.repositorySelection,
          status: record.status,
          permissions: record.permissions,
          events: record.events,
          repositories: record.repositories,
          connected_by_user_id: record.connectedByUserId,
          suspended_at: record.suspendedAt ?? null,
          last_synced_at: record.lastSyncedAt ?? null,
          last_event: record.lastEvent ?? null,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
        }),
      });
      await requireSuccess(response, "save");
    },
    async remove(scope, installationId) {
      const query = new URLSearchParams({ ...scopeQuery(scope), installation_id: `eq.${installationId}` });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_github_installations?${query}`, { method: "DELETE", headers });
      await requireSuccess(response, "remove");
    },
  };
}

const memoryStore = createMemoryGitHubAppStore();

export function getGitHubAppStore(): { store: GitHubAppStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return {
      store: createSupabaseGitHubAppStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey }),
      persistence: "supabase",
    };
  }
  return { store: memoryStore, persistence: "memory" };
}

import { evaluateGitHubPullRequest, type GitHubGateOperation, type GitHubGateResult } from "@vetolayer/github-gate";
import { readServEnvironment } from "@vetolayer/serv";
import type { WorkspaceContext } from "./workspace";
import { getDecisionStore } from "./decision-store";
import { readServerEnvironment } from "./env";
import {
  createInstallationAccessToken,
  getGitHubInstallation,
  listInstallationRepositories,
  readGitHubAppConfig,
  type GitHubInstallationInfo,
} from "./github-app";
import {
  connectionFromGitHub,
  getGitHubAppStore,
  type GitHubInstallationScope,
  type StoredGitHubInstallation,
} from "./github-app-store";
import { getIntegrationStore } from "./integration-store";

export function githubScope(workspace: Pick<WorkspaceContext, "workspaceId" | "projectId" | "environmentId">): GitHubInstallationScope {
  return {
    workspaceId: workspace.workspaceId,
    projectId: workspace.projectId,
    environmentId: workspace.environmentId,
  };
}

async function saveGenericStatus(record: StoredGitHubInstallation) {
  const environment = readServerEnvironment();
  const state = record.status !== "active"
    ? "needs-config" as const
    : environment.servConfigured
      ? "ready" as const
      : "warning" as const;
  const { store } = getIntegrationStore();
  await store.save({
    workspaceId: record.workspaceId,
    projectId: record.projectId,
    environmentId: record.environmentId,
    integration: "github",
    state,
    account: record.accountLogin,
    lastCode: record.status === "active"
      ? environment.servConfigured ? "GITHUB_APP_CONNECTED" : "GITHUB_APP_CONNECTED_SERV_MISSING"
      : record.status === "suspended" ? "GITHUB_APP_SUSPENDED" : "GITHUB_APP_DISCONNECTED",
    updatedAt: new Date().toISOString(),
  });
}

export async function attachGitHubInstallation(input: {
  scope: GitHubInstallationScope;
  installation: GitHubInstallationInfo;
  connectedByUserId: string;
  fetchImpl?: typeof fetch;
}) {
  const config = readGitHubAppConfig();
  const latest = await getGitHubInstallation({ config, installationId: input.installation.id, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) });
  const { store, persistence } = getGitHubAppStore();
  const existing = await store.get(input.scope, latest.id);
  let repositories = existing?.repositories ?? [];
  if (!latest.suspendedAt) {
    const access = await createInstallationAccessToken({ config, installationId: latest.id, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) });
    repositories = await listInstallationRepositories({ installationToken: access.token, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) });
  }
  const record = connectionFromGitHub({
    scope: input.scope,
    installation: latest,
    repositories,
    connectedByUserId: input.connectedByUserId,
    existing,
  });
  await store.save(record);
  await saveGenericStatus(record);
  return { connection: record, persistence };
}

export async function refreshGitHubInstallation(input: {
  scope: GitHubInstallationScope;
  installationId: number;
  actorUserId?: string;
  fetchImpl?: typeof fetch;
}) {
  const { store, persistence } = getGitHubAppStore();
  const existing = await store.get(input.scope, input.installationId);
  if (!existing) return null;
  try {
    const config = readGitHubAppConfig();
    const installation = await getGitHubInstallation({ config, installationId: input.installationId, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) });
    let repositories = existing.repositories;
    if (!installation.suspendedAt) {
      const access = await createInstallationAccessToken({ config, installationId: input.installationId, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) });
      repositories = await listInstallationRepositories({ installationToken: access.token, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) });
    }
    const record = connectionFromGitHub({
      scope: input.scope,
      installation,
      repositories,
      connectedByUserId: input.actorUserId ?? existing.connectedByUserId,
      existing,
    });
    await store.save(record);
    await saveGenericStatus(record);
    return { connection: record, persistence };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    if (code === "GITHUB_INSTALLATION_NOT_FOUND") {
      const now = new Date().toISOString();
      const record: StoredGitHubInstallation = { ...existing, status: "uninstalled", repositories: [], updatedAt: now, lastSyncedAt: now };
      await store.save(record);
      await saveGenericStatus(record);
      return { connection: record, persistence };
    }
    throw error;
  }
}

export async function disconnectGitHubInstallation(scope: GitHubInstallationScope, installationId: number) {
  const { store, persistence } = getGitHubAppStore();
  const existing = await store.get(scope, installationId);
  if (!existing) return { removed: false, persistence };
  await store.remove(scope, installationId);
  const remaining = await store.list(scope);
  if (!remaining.some((candidate) => candidate.status === "active")) {
    const { store: integrationStore } = getIntegrationStore();
    await integrationStore.save({
      ...scope,
      integration: "github",
      state: "needs-config",
      lastCode: "GITHUB_APP_INSTALL_REQUIRED",
      updatedAt: new Date().toISOString(),
    });
  }
  return { removed: true, persistence };
}

export async function recordGitHubWebhookEvent(input: {
  installationId: number;
  event: string;
  status?: StoredGitHubInstallation["status"];
  clearRepositories?: boolean;
}) {
  const { store } = getGitHubAppStore();
  const connections = await store.listByInstallationId(input.installationId);
  const now = new Date().toISOString();
  for (const connection of connections) {
    const next: StoredGitHubInstallation = {
      ...connection,
      ...(input.status ? { status: input.status } : {}),
      ...(input.clearRepositories ? { repositories: [] } : {}),
      lastEvent: input.event,
      updatedAt: now,
    };
    await store.save(next);
    await saveGenericStatus(next);
  }
  return connections.length;
}

export async function refreshConnectionsForInstallation(installationId: number) {
  const { store } = getGitHubAppStore();
  const connections = await store.listByInstallationId(installationId);
  const refreshed: StoredGitHubInstallation[] = [];
  for (const connection of connections) {
    const result = await refreshGitHubInstallation({
      scope: { workspaceId: connection.workspaceId, projectId: connection.projectId, environmentId: connection.environmentId },
      installationId,
    });
    if (result) refreshed.push(result.connection);
  }
  return refreshed;
}

export async function evaluateConnectedPullRequest(input: {
  workspace: WorkspaceContext;
  installationId: number;
  owner: string;
  repo: string;
  pullRequest: number;
  operation?: GitHubGateOperation;
  fetchImpl?: typeof fetch;
}): Promise<GitHubGateResult> {
  const scope = githubScope(input.workspace);
  const { store } = getGitHubAppStore();
  const connection = await store.get(scope, input.installationId);
  if (!connection || connection.status !== "active") throw new Error("GitHub installation is not active for this product scope.");
  const fullName = `${input.owner}/${input.repo}`.toLowerCase();
  if (!connection.repositories.some((repository) => repository.fullName.toLowerCase() === fullName)) {
    throw new Error("Repository is not connected to this VetoLayer scope.");
  }

  const config = readGitHubAppConfig();
  const access = await createInstallationAccessToken({ config, installationId: connection.installationId, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) });
  const result = await evaluateGitHubPullRequest({
    owner: input.owner,
    repo: input.repo,
    pullRequest: input.pullRequest,
    githubToken: access.token,
    ...(input.operation ? { operation: input.operation } : {}),
    servConfig: readServEnvironment(),
    ...(input.fetchImpl ? { githubFetch: input.fetchImpl } : {}),
    receiptScope: {
      workspaceId: input.workspace.workspaceId,
      projectId: input.workspace.projectId,
      environmentId: input.workspace.environmentId,
      workspaceName: input.workspace.workspace.name,
      projectName: input.workspace.project.name,
      environmentName: input.workspace.environment.name,
    },
  });

  const { store: decisionStore } = getDecisionStore();
  await decisionStore.save({
    id: result.receipt.receiptId,
    workspaceId: input.workspace.workspaceId,
    projectId: input.workspace.projectId,
    environmentId: input.workspace.environmentId,
    source: "integration",
    receipt: result.receipt,
    createdAt: result.receipt.timestamps.receiptCreatedAt,
  });
  return result;
}

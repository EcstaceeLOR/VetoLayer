import type { ProductScope } from "../workspace-model";
import { getIntegrationStore } from "./integration-store";
import {
  getGitHubInstallationMetadata,
  listGitHubInstallationRepositories,
  missingRequiredGitHubPermissions,
  type GitHubAppConfig,
} from "./github-app";
import {
  createStoredGitHubInstallation,
  getGitHubAppStore,
  type StoredGitHubInstallation,
} from "./github-app-store";

export type GitHubSyncResult = {
  installation: StoredGitHubInstallation;
  repositories: Awaited<ReturnType<ReturnType<typeof getGitHubAppStore>["store"]["listRepositories"]>>;
  missingPermissions: string[];
};

export async function syncGitHubConnection(input: {
  scope: ProductScope;
  installationId: number;
  installedByUserId: string;
  config: GitHubAppConfig;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<GitHubSyncResult> {
  const now = (input.now ?? new Date()).toISOString();
  const metadata = await getGitHubInstallationMetadata({ config: input.config, installationId: input.installationId, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) });
  const missingPermissions = missingRequiredGitHubPermissions(metadata.permissions);
  const state = metadata.suspended ? "suspended" : missingPermissions.length ? "permission-error" : "ready";
  const installation = createStoredGitHubInstallation({ scope: input.scope, metadata, installedByUserId: input.installedByUserId, state, now });
  const repositories = state === "suspended" ? [] : await listGitHubInstallationRepositories({ config: input.config, installationId: input.installationId, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) });

  const { store: githubStore } = getGitHubAppStore();
  await githubStore.saveInstallation(installation);
  await githubStore.replaceRepositories(installation.id, repositories, now);
  const storedRepositories = await githubStore.listRepositories(installation.id);

  const activeRepositories = storedRepositories.filter((repo) => repo.connected).length;
  const integrationState = state === "ready" && activeRepositories > 0 ? "ready" : "needs-config";
  const integrationCode = state === "suspended"
    ? "GITHUB_APP_SUSPENDED"
    : missingPermissions.length
      ? "GITHUB_APP_PERMISSION_ERROR"
      : activeRepositories === 0
        ? "GITHUB_NO_REPOSITORIES_CONNECTED"
        : "GITHUB_APP_CONNECTED";
  const { store: integrationStore } = getIntegrationStore();
  await integrationStore.save({
    ...input.scope,
    integration: "github",
    state: integrationState,
    account: metadata.accountLogin,
    lastCode: integrationCode,
    updatedAt: now,
  });

  return { installation, repositories: storedRepositories, missingPermissions };
}

export async function updateGenericGitHubIntegrationState(input: {
  installation: StoredGitHubInstallation;
  state: "ready" | "warning" | "needs-config";
  code: string;
  now?: string;
}) {
  const { store } = getIntegrationStore();
  await store.save({
    workspaceId: input.installation.workspaceId,
    projectId: input.installation.projectId,
    environmentId: input.installation.environmentId,
    integration: "github",
    state: input.state,
    account: input.installation.accountLogin,
    lastCode: input.code,
    updatedAt: input.now ?? new Date().toISOString(),
  });
}

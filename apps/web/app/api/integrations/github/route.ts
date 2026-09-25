import { NextResponse } from "next/server";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../lib/server/api-auth";
import { GITHUB_APP_REQUIRED_PERMISSIONS, readGitHubAppConfig } from "../../../../lib/server/github-app";
import { getGitHubAppStore, type StoredGitHubInstallation } from "../../../../lib/server/github-app-store";
import { syncGitHubConnection, updateGenericGitHubIntegrationState } from "../../../../lib/server/github-app-service";
import { getIntegrationStore } from "../../../../lib/server/integration-store";

export const runtime = "nodejs";

function scopeFromAuth(workspace: { workspaceId: string; projectId: string; environmentId: string }) {
  return { workspaceId: workspace.workspaceId, projectId: workspace.projectId, environmentId: workspace.environmentId };
}

function publicInstallation(installation: StoredGitHubInstallation | null) {
  if (!installation) return null;
  return {
    id: installation.id,
    installationId: installation.installationId,
    accountLogin: installation.accountLogin,
    accountType: installation.accountType,
    repositorySelection: installation.repositorySelection,
    state: installation.state,
    permissions: installation.permissions,
    lastSyncAt: installation.lastSyncAt,
    lastEventAt: installation.lastEventAt,
    updatedAt: installation.updatedAt,
  };
}

export async function GET() {
  const auth = await requireApiWorkspace("integrations.read");
  if (!auth.ok) return auth.response;
  const { config, missing } = readGitHubAppConfig();
  const { store, persistence } = getGitHubAppStore();
  const installation = await store.getInstallation(scopeFromAuth(auth.workspace));
  const repositories = installation ? await store.listRepositories(installation.id) : [];
  return NextResponse.json({
    app: { configured: Boolean(config), missing, requiredPermissions: GITHUB_APP_REQUIRED_PERMISSIONS },
    installation: publicInstallation(installation),
    repositories,
    persistence,
    scope: { workspaceId: auth.workspace.workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("integrations.write");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const action = body && typeof body === "object" && !Array.isArray(body) ? (body as { action?: unknown }).action : undefined;
  if (!new Set(["refresh", "select", "disconnect", "test"]).has(String(action))) {
    return NextResponse.json({ error: { code: "INVALID_ACTION", message: "action must be refresh, select, test, or disconnect." } }, { status: 400 });
  }

  const scope = scopeFromAuth(auth.workspace);
  const { store, persistence } = getGitHubAppStore();
  const installation = await store.getInstallation(scope);

  if (action === "disconnect") {
    if (installation) await store.deleteInstallation(scope);
    const { store: integrationStore } = getIntegrationStore();
    await integrationStore.save({ ...scope, integration: "github", state: "needs-config", lastCode: "GITHUB_APP_DISCONNECTED", updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, installation: null, repositories: [], persistence });
  }

  if (!installation) return NextResponse.json({ error: { code: "GITHUB_APP_NOT_CONNECTED", message: "Install the VetoLayer GitHub App for this project and environment first." } }, { status: 409 });

  if (action === "select") {
    const rawIds = (body as { repositoryIds?: unknown }).repositoryIds;
    if (!Array.isArray(rawIds) || rawIds.some((value) => !Number.isSafeInteger(value) || Number(value) <= 0)) {
      return NextResponse.json({ error: { code: "INVALID_REPOSITORIES", message: "repositoryIds must be an array of GitHub repository IDs." } }, { status: 400 });
    }
    const repositoryIds = [...new Set(rawIds.map(Number))];
    const available = await store.listRepositories(installation.id);
    const allowed = new Set(available.map((repo) => repo.repositoryId));
    if (repositoryIds.some((id) => !allowed.has(id))) return NextResponse.json({ error: { code: "REPOSITORY_NOT_AVAILABLE", message: "One or more repositories are not available to this GitHub App installation." } }, { status: 403 });
    const now = new Date().toISOString();
    await store.setConnectedRepositories(installation.id, repositoryIds, now);
    const repositories = await store.listRepositories(installation.id);
    await updateGenericGitHubIntegrationState({
      installation,
      state: installation.state === "ready" && repositories.some((repo) => repo.connected) ? "ready" : "needs-config",
      code: repositories.some((repo) => repo.connected) ? "GITHUB_APP_CONNECTED" : "GITHUB_NO_REPOSITORIES_CONNECTED",
      now,
    });
    return NextResponse.json({ ok: true, installation: publicInstallation(installation), repositories, persistence });
  }

  const { config } = readGitHubAppConfig();
  if (!config) return NextResponse.json({ error: { code: "GITHUB_APP_NOT_CONFIGURED", message: "The VetoLayer GitHub App is not configured on this deployment." } }, { status: 503 });

  try {
    const result = await syncGitHubConnection({ scope, installationId: installation.installationId, installedByUserId: installation.installedByUserId, config });
    return NextResponse.json({
      ok: result.installation.state === "ready" && result.repositories.some((repo) => repo.connected),
      installation: publicInstallation(result.installation),
      repositories: result.repositories,
      missingPermissions: result.missingPermissions,
      persistence,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub connection refresh failed.";
    const revoked = message.includes("(404)") || message.includes("(401)");
    if (revoked) {
      const now = new Date().toISOString();
      await store.updateInstallationState(installation.installationId, "revoked", now);
      await updateGenericGitHubIntegrationState({ installation: { ...installation, state: "revoked", updatedAt: now }, state: "needs-config", code: "GITHUB_APP_REVOKED", now });
      return NextResponse.json({ error: { code: "GITHUB_APP_REVOKED", message: "GitHub no longer recognizes this installation. Reinstall VetoLayer to reconnect." } }, { status: 409 });
    }
    return NextResponse.json({ error: { code: "GITHUB_CONNECTION_FAILED", message: "VetoLayer could not refresh this GitHub App installation. Check GitHub permissions and try again." } }, { status: 502 });
  }
}

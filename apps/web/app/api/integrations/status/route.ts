import { NextResponse } from "next/server";
import type { GitHubInstallationView, IntegrationTestResult } from "../../../../lib/integration-contracts";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../lib/server/api-auth";
import { getGitHubAppStore, type StoredGitHubInstallation } from "../../../../lib/server/github-app-store";
import { githubScope, refreshGitHubInstallation } from "../../../../lib/server/github-app-service";
import { getIntegrationReadiness, testDeveloperApiIntegration, testGitHubIntegration } from "../../../../lib/server/integration-health";
import { getIntegrationStore } from "../../../../lib/server/integration-store";
import { consumeRateLimit, requestClientKey } from "../../../../lib/server/rate-limit";
import type { WorkspaceContext } from "../../../../lib/server/workspace";

export const runtime = "nodejs";

function toView(record: StoredGitHubInstallation): GitHubInstallationView {
  return {
    installationId: record.installationId,
    accountLogin: record.accountLogin,
    accountType: record.accountType,
    ...(record.accountUrl ? { accountUrl: record.accountUrl } : {}),
    ...(record.installationUrl ? { installationUrl: record.installationUrl } : {}),
    repositorySelection: record.repositorySelection,
    status: record.status,
    repositories: record.repositories.map((repository) => ({
      id: repository.id,
      name: repository.name,
      fullName: repository.fullName,
      private: repository.private,
      htmlUrl: repository.htmlUrl,
      defaultBranch: repository.defaultBranch,
      archived: repository.archived,
      disabled: repository.disabled,
    })),
    ...(record.lastSyncedAt ? { lastSyncedAt: record.lastSyncedAt } : {}),
    ...(record.lastEvent ? { lastEvent: record.lastEvent } : {}),
    updatedAt: record.updatedAt,
  };
}

export async function GET() {
  const auth = await requireApiWorkspace("integrations.read");
  if (!auth.ok) return auth.response;

  try {
    const scope = githubScope(auth.workspace);
    const { store, persistence } = getIntegrationStore();
    const connections = await store.list(auth.workspace.workspaceId, { projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId });
    const { store: githubStore, persistence: githubPersistence } = getGitHubAppStore();
    const githubInstallations = (await githubStore.list(scope)).map(toView);
    return NextResponse.json({
      readiness: getIntegrationReadiness(),
      connections,
      githubInstallations,
      persistence,
      githubPersistence,
      scope: { projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId },
    });
  } catch {
    return NextResponse.json({ error: { code: "INVALID_SERVER_CONFIGURATION", message: "Integration status is unavailable because the server configuration is invalid." } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("integrations.write");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  const rate = consumeRateLimit({ key: `integration-test:${auth.workspace.workspaceId}:${auth.workspace.userId}:${requestClientKey(request)}`, limit: 10 });
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many integration checks. Try again shortly." } }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const integration = body && typeof body === "object" && !Array.isArray(body) ? (body as { integration?: unknown }).integration : undefined;
  if (integration !== "github" && integration !== "developer-api") return NextResponse.json({ error: { code: "INVALID_INTEGRATION", message: "integration must be github or developer-api." } }, { status: 400 });

  try {
    const result = integration === "github"
      ? await testScopedGitHub(auth.workspace)
      : testDeveloperApiIntegration();
    const { store, persistence } = getIntegrationStore();
    await store.save({
      workspaceId: auth.workspace.workspaceId,
      projectId: auth.workspace.projectId,
      environmentId: auth.workspace.environmentId,
      integration,
      state: stateFromResult(result),
      ...(readAccount(result) ? { account: readAccount(result) } : {}),
      lastCode: result.code,
      updatedAt: new Date().toISOString(),
    });
    const connections = await store.list(auth.workspace.workspaceId, { projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId });
    const { store: githubStore } = getGitHubAppStore();
    const githubInstallations = (await githubStore.list(githubScope(auth.workspace))).map(toView);
    return NextResponse.json({ result, readiness: getIntegrationReadiness(), connections, githubInstallations, persistence, scope: { projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId } });
  } catch {
    return NextResponse.json({ error: { code: "INTEGRATION_TEST_FAILED", message: "The integration check could not be completed safely." } }, { status: 500 });
  }
}

async function testScopedGitHub(workspace: WorkspaceContext): Promise<IntegrationTestResult> {
  const infrastructure = testGitHubIntegration();
  if (!infrastructure.ok) return infrastructure;
  const scope = githubScope(workspace);
  const { store } = getGitHubAppStore();
  const connections = await store.list(scope);
  const candidate = connections.find((connection) => connection.status === "active") ?? connections[0];
  if (!candidate) {
    return {
      integration: "github",
      ok: false,
      level: "error",
      code: "GITHUB_APP_INSTALL_REQUIRED",
      message: "Install the VetoLayer GitHub App for this project environment before verifying GitHub.",
      nextSteps: ["Choose Connect GitHub, select repositories in GitHub, and return to VetoLayer."],
    };
  }
  const refreshed = await refreshGitHubInstallation({
    scope,
    installationId: candidate.installationId,
    actorUserId: workspace.userId,
  });
  const connection = refreshed?.connection;
  if (!connection || connection.status !== "active") {
    return {
      integration: "github",
      ok: false,
      level: "error",
      code: connection?.status === "suspended" ? "GITHUB_APP_SUSPENDED" : "GITHUB_APP_DISCONNECTED",
      message: connection?.status === "suspended"
        ? "The GitHub App installation is suspended. Restore it in GitHub, then refresh."
        : "The GitHub App installation is no longer available. Reinstall VetoLayer to reconnect repositories.",
    };
  }
  const servReady = getIntegrationReadiness().github.servConfigured;
  return {
    integration: "github",
    ok: true,
    level: servReady ? "success" : "warning",
    code: servReady ? "GITHUB_APP_CONNECTED" : "GITHUB_APP_CONNECTED_SERV_MISSING",
    message: servReady
      ? "GitHub is connected through a verified App installation and repository access is current."
      : "GitHub is connected, but SERV contextual reasoning still needs configuration.",
    details: {
      account: connection.accountLogin,
      repositories: connection.repositories.length,
      installationId: connection.installationId,
    },
    ...(!servReady ? { nextSteps: ["Configure SERV_API_KEY and SERV_MODEL before relying on contextual GitHub decisions."] } : {}),
  };
}

function stateFromResult(result: IntegrationTestResult) { if (!result.ok) return "needs-config" as const; return result.level === "warning" ? "warning" as const : "ready" as const; }
function readAccount(result: IntegrationTestResult) { const account = result.details?.account; return typeof account === "string" ? account : undefined; }

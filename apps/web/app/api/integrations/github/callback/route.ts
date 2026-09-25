import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { hasWorkspacePermission } from "../../../../../lib/workspace-model";
import { resolveAppOrigin } from "../../../../../lib/server/app-origin";
import { recordAuditEvent } from "../../../../../lib/server/audit";
import {
  exchangeGitHubUserCode,
  readGitHubAppConfig,
  verifyUserInstallationAccess,
} from "../../../../../lib/server/github-app";
import { getGitHubAppStore } from "../../../../../lib/server/github-app-store";
import { syncGitHubConnection } from "../../../../../lib/server/github-app-service";
import { getAuthenticatedIdentity } from "../../../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../../../lib/server/workspace-store";

export const runtime = "nodejs";

function redirectResult(request: Request, code: string) {
  const url = new URL("/dashboard/integrations", request.url);
  url.searchParams.set("github", code);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const rawInstallationId = url.searchParams.get("installation_id");
  const installationId = rawInstallationId ? Number(rawInstallationId) : NaN;
  if (!code || !state || !Number.isSafeInteger(installationId) || installationId <= 0) return redirectResult(request, "callback_invalid");

  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "session_expired");
    login.searchParams.set("next", "/dashboard/integrations");
    return NextResponse.redirect(login);
  }

  const { config } = readGitHubAppConfig();
  if (!config) return redirectResult(request, "app_not_configured");

  const { store: githubStore, persistence } = getGitHubAppStore();
  if (process.env.NODE_ENV === "production" && persistence !== "supabase") return redirectResult(request, "persistence_required");

  const stateHash = createHash("sha256").update(state).digest("hex");
  const pending = await githubStore.consumeInstallState(stateHash);
  if (!pending || pending.userId !== identity.userId || new Date(pending.expiresAt).getTime() <= Date.now()) return redirectResult(request, "state_invalid");

  const { store: workspaceStore } = getWorkspaceStore();
  const [membership, project, environment] = await Promise.all([
    workspaceStore.getMembership(pending.workspaceId, identity.userId),
    workspaceStore.getProject(pending.workspaceId, pending.projectId),
    workspaceStore.getEnvironment(pending.workspaceId, pending.projectId, pending.environmentId),
  ]);
  if (!membership || !hasWorkspacePermission(membership.role, "integrations.write")) return redirectResult(request, "forbidden");
  if (!project || project.status !== "active" || !environment || environment.status !== "active") return redirectResult(request, "scope_invalid");

  try {
    const origin = resolveAppOrigin(url.origin) ?? url.origin;
    const userToken = await exchangeGitHubUserCode({ config, code, redirectUri: `${origin}/api/integrations/github/callback` });
    const authorized = await verifyUserInstallationAccess({ userAccessToken: userToken, installationId });
    if (!authorized) return redirectResult(request, "installation_not_authorized");

    const result = await syncGitHubConnection({
      scope: { workspaceId: pending.workspaceId, projectId: pending.projectId, environmentId: pending.environmentId },
      installationId,
      installedByUserId: identity.userId,
      config,
    });
    await recordAuditEvent({
      workspaceId: pending.workspaceId,
      projectId: pending.projectId,
      environmentId: pending.environmentId,
      actorKind: "human",
      actorUserId: identity.userId,
      actorLabel: identity.displayName ?? identity.email ?? identity.userId,
      actorRole: membership.role,
      action: "integration.connect",
      category: "integration",
      targetType: "github_installation",
      targetId: result.installation.id,
      targetLabel: result.installation.accountLogin,
      href: "/dashboard/integrations",
      request,
      metadata: {
        integration: "github",
        installationId,
        state: result.installation.state,
        repositorySelection: result.installation.repositorySelection,
        connectedRepositoryCount: result.repositories.filter((repository) => repository.connected).length,
        missingPermissions: result.missingPermissions,
      },
    });
    return redirectResult(
      request,
      result.installation.state === "ready" && result.repositories.some((repo) => repo.connected)
        ? "connected"
        : result.installation.state === "permission-error"
          ? "permission_error"
          : result.installation.state === "suspended"
            ? "suspended"
            : "no_repositories",
    );
  } catch {
    await recordAuditEvent({
      workspaceId: pending.workspaceId,
      projectId: pending.projectId,
      environmentId: pending.environmentId,
      actorKind: "human",
      actorUserId: identity.userId,
      actorLabel: identity.displayName ?? identity.email ?? identity.userId,
      actorRole: membership.role,
      action: "integration.connect.failed",
      category: "integration",
      targetType: "github_installation",
      targetId: String(installationId),
      targetLabel: "GitHub App",
      href: "/dashboard/integrations",
      request,
      metadata: { integration: "github", installationId, code: "connection_failed" },
    });
    return redirectResult(request, "connection_failed");
  }
}

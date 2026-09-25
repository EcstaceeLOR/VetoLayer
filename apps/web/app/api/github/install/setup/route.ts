import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasWorkspacePermission } from "../../../../../lib/workspace-model";
import { resolveAppOrigin } from "../../../../../lib/server/app-origin";
import {
  createGitHubAuthorizeUrl,
  createGitHubInstallState,
  createGitHubPkce,
  readGitHubAppConfig,
  verifyGitHubInstallState,
} from "../../../../../lib/server/github-app";
import { getAuthenticatedWorkspace } from "../../../../../lib/server/workspace";

export const runtime = "nodejs";
const PKCE_COOKIE = "vl_github_pkce";

function errorRedirect(origin: string, code: string) {
  const target = new URL("/dashboard/integrations", origin);
  target.searchParams.set("github_error", code);
  return NextResponse.redirect(target);
}

function sameScope(
  state: { userId: string; workspaceId: string; projectId: string; environmentId: string },
  workspace: { userId: string; workspaceId: string; projectId: string; environmentId: string },
) {
  return state.userId === workspace.userId
    && state.workspaceId === workspace.workspaceId
    && state.projectId === workspace.projectId
    && state.environmentId === workspace.environmentId;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = resolveAppOrigin(url.origin) ?? url.origin;
  const installationId = Number(url.searchParams.get("installation_id"));
  const inboundState = url.searchParams.get("state") ?? "";
  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) return errorRedirect(origin, "SESSION_REQUIRED");
  if (!hasWorkspacePermission(workspace.role, "integrations.write")) return errorRedirect(origin, "FORBIDDEN");
  if (!Number.isInteger(installationId) || installationId < 1) return errorRedirect(origin, "GITHUB_INSTALLATION_INVALID");

  try {
    const config = readGitHubAppConfig();
    const verified = verifyGitHubInstallState(inboundState, config.clientSecret);
    if (!sameScope(verified, workspace)) return errorRedirect(origin, "GITHUB_SCOPE_MISMATCH");

    const oauthState = createGitHubInstallState({
      userId: workspace.userId,
      scope: {
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
        environmentId: workspace.environmentId,
      },
      returnTo: verified.returnTo,
      signingSecret: config.clientSecret,
      installationId,
    });
    const { verifier, challenge } = createGitHubPkce();
    const stateHash = createHash("sha256").update(oauthState).digest("base64url");
    const payload = Buffer.from(JSON.stringify({ stateHash, verifier })).toString("base64url");
    const cookieStore = await cookies();
    cookieStore.set(PKCE_COOKIE, payload, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60,
      path: "/api/github/install/callback",
    });

    return NextResponse.redirect(createGitHubAuthorizeUrl(config, oauthState, challenge));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "GITHUB_SETUP_FAILED")
      : "GITHUB_SETUP_FAILED";
    return errorRedirect(origin, code);
  }
}

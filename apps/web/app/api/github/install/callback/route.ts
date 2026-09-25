import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasWorkspacePermission } from "../../../../../lib/workspace-model";
import { resolveAppOrigin, safeAppPath } from "../../../../../lib/server/app-origin";
import {
  exchangeGitHubOAuthCode,
  readGitHubAppConfig,
  verifyGitHubInstallState,
  verifyInstallationAccessibleToUser,
} from "../../../../../lib/server/github-app";
import { attachGitHubInstallation } from "../../../../../lib/server/github-app-service";
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
  const code = url.searchParams.get("code") ?? "";
  const rawState = url.searchParams.get("state") ?? "";
  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) return errorRedirect(origin, "SESSION_REQUIRED");
  if (!hasWorkspacePermission(workspace.role, "integrations.write")) return errorRedirect(origin, "FORBIDDEN");

  const cookieStore = await cookies();
  const pkceCookie = cookieStore.get(PKCE_COOKIE)?.value;
  cookieStore.delete(PKCE_COOKIE);

  try {
    const config = readGitHubAppConfig();
    const state = verifyGitHubInstallState(rawState, config.clientSecret);
    if (!state.installationId || !sameScope(state, workspace)) return errorRedirect(origin, "GITHUB_SCOPE_MISMATCH");
    if (!code || !pkceCookie) return errorRedirect(origin, "GITHUB_OAUTH_STATE_MISSING");

    let pkce: { stateHash?: unknown; verifier?: unknown };
    try {
      pkce = JSON.parse(Buffer.from(pkceCookie, "base64url").toString("utf8")) as { stateHash?: unknown; verifier?: unknown };
    } catch {
      return errorRedirect(origin, "GITHUB_OAUTH_STATE_INVALID");
    }
    const stateHash = createHash("sha256").update(rawState).digest("base64url");
    if (pkce.stateHash !== stateHash || typeof pkce.verifier !== "string") return errorRedirect(origin, "GITHUB_OAUTH_STATE_INVALID");

    const redirectUri = `${origin}/api/github/install/callback`;
    const userToken = await exchangeGitHubOAuthCode({
      config,
      code,
      codeVerifier: pkce.verifier,
      redirectUri,
    });
    const installation = await verifyInstallationAccessibleToUser({
      config,
      userToken,
      installationId: state.installationId,
    });
    await attachGitHubInstallation({
      scope: {
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
        environmentId: workspace.environmentId,
      },
      installation,
      connectedByUserId: workspace.userId,
    });

    const returnTo = safeAppPath(state.returnTo, "/dashboard/integrations");
    const destination = new URL(returnTo, origin);
    destination.searchParams.set("github", "connected");
    return NextResponse.redirect(destination);
  } catch (error) {
    const githubCode = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "GITHUB_CONNECT_FAILED")
      : "GITHUB_CONNECT_FAILED";
    return errorRedirect(origin, githubCode);
  }
}

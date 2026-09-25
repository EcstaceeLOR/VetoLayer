import { NextResponse } from "next/server";
import { hasWorkspacePermission } from "../../../../../lib/workspace-model";
import { resolveAppOrigin, safeAppPath } from "../../../../../lib/server/app-origin";
import { createGitHubInstallState, createGitHubInstallUrl, readGitHubAppConfig } from "../../../../../lib/server/github-app";
import { getAuthenticatedWorkspace } from "../../../../../lib/server/workspace";

export const runtime = "nodejs";

function errorRedirect(origin: string, code: string) {
  const target = new URL("/dashboard/integrations", origin);
  target.searchParams.set("github_error", code);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = resolveAppOrigin(url.origin) ?? url.origin;
  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) {
    const login = new URL("/login", origin);
    login.searchParams.set("next", "/dashboard/integrations");
    return NextResponse.redirect(login);
  }
  if (!hasWorkspacePermission(workspace.role, "integrations.write")) return errorRedirect(origin, "FORBIDDEN");
  if (workspace.project.status !== "active" || workspace.environment.status !== "active") return errorRedirect(origin, "PROJECT_ARCHIVED");

  try {
    const config = readGitHubAppConfig();
    const returnTo = safeAppPath(url.searchParams.get("returnTo"), "/dashboard/integrations");
    const state = createGitHubInstallState({
      userId: workspace.userId,
      scope: {
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
        environmentId: workspace.environmentId,
      },
      returnTo,
      signingSecret: config.clientSecret,
    });
    return NextResponse.redirect(createGitHubInstallUrl(config, state));
  } catch {
    return errorRedirect(origin, "GITHUB_APP_NOT_CONFIGURED");
  }
}

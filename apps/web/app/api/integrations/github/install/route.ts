import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../../lib/server/api-auth";
import { createGitHubInstallUrl, readGitHubAppConfig } from "../../../../../lib/server/github-app";
import { getGitHubAppStore } from "../../../../../lib/server/github-app-store";

export const runtime = "nodejs";

function integrationsRedirect(request: Request, code: string) {
  const url = new URL("/dashboard/integrations", request.url);
  url.searchParams.set("github", code);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const auth = await requireApiWorkspace("integrations.write");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  const { config } = readGitHubAppConfig();
  if (!config) return integrationsRedirect(request, "app_not_configured");

  const { store, persistence } = getGitHubAppStore();
  if (process.env.NODE_ENV === "production" && persistence !== "supabase") {
    return integrationsRedirect(request, "persistence_required");
  }

  const state = randomBytes(32).toString("base64url");
  const stateHash = createHash("sha256").update(state).digest("hex");
  const now = new Date();
  await store.saveInstallState({
    stateHash,
    workspaceId: auth.workspace.workspaceId,
    projectId: auth.workspace.projectId,
    environmentId: auth.workspace.environmentId,
    userId: auth.workspace.userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
  });

  return NextResponse.redirect(createGitHubInstallUrl(config, state));
}

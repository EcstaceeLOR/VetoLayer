import { NextResponse } from "next/server";
import type { GitHubInstallationView } from "../../../../../lib/integration-contracts";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../../lib/server/api-auth";
import type { StoredGitHubInstallation } from "../../../../../lib/server/github-app-store";
import { disconnectGitHubInstallation, githubScope, refreshGitHubInstallation } from "../../../../../lib/server/github-app-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ installationId: string }> };

function parseInstallationId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiWorkspace("integrations.write");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;
  const { installationId: rawId } = await context.params;
  const installationId = parseInstallationId(rawId);
  if (!installationId) return NextResponse.json({ error: { code: "INVALID_INSTALLATION", message: "GitHub installation id is invalid." } }, { status: 400 });

  try {
    const result = await refreshGitHubInstallation({
      scope: githubScope(auth.workspace),
      installationId,
      actorUserId: auth.workspace.userId,
    });
    if (!result) return NextResponse.json({ error: { code: "INSTALLATION_NOT_CONNECTED", message: "That GitHub installation is not connected to the current project environment." } }, { status: 404 });
    return NextResponse.json({ connection: toView(result.connection), persistence: result.persistence });
  } catch {
    return NextResponse.json({ error: { code: "GITHUB_REFRESH_FAILED", message: "VetoLayer could not refresh this GitHub installation. Check its GitHub permissions and retry." } }, { status: 502 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiWorkspace("integrations.write");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;
  const { installationId: rawId } = await context.params;
  const installationId = parseInstallationId(rawId);
  if (!installationId) return NextResponse.json({ error: { code: "INVALID_INSTALLATION", message: "GitHub installation id is invalid." } }, { status: 400 });

  const result = await disconnectGitHubInstallation(githubScope(auth.workspace), installationId);
  return NextResponse.json({ disconnected: result.removed, persistence: result.persistence });
}

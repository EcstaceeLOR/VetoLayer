import { NextResponse } from "next/server";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../../lib/server/api-auth";
import { disconnectGitHubInstallation, githubScope, refreshGitHubInstallation } from "../../../../../lib/server/github-app-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ installationId: string }> };

function parseInstallationId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
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
    return NextResponse.json({ connection: result.connection, persistence: result.persistence });
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

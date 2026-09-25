import { NextResponse } from "next/server";
import type { WorkspacePermission } from "../workspace-model";
import { hasWorkspacePermission } from "../workspace-model";
import { getAuthenticatedIdentity, getAuthenticatedWorkspace, type WorkspaceContext } from "./workspace";

export async function requireApiWorkspace(permission?: WorkspacePermission): Promise<
  | { ok: true; workspace: WorkspaceContext }
  | { ok: false; response: NextResponse }
> {
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to access VetoLayer." } },
        { status: 401 },
      ),
    };
  }

  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "WORKSPACE_CONTEXT_REQUIRED", message: "Create or select an active workspace, project, and environment first." } },
        { status: 409 },
      ),
    };
  }

  if (permission && !hasWorkspacePermission(workspace.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Your workspace role does not allow this action." } },
        { status: 403 },
      ),
    };
  }

  return { ok: true, workspace };
}

export function rejectArchivedProjectWrite(workspace: WorkspaceContext) {
  if (workspace.project.status === "active") return null;
  return NextResponse.json(
    { error: { code: "PROJECT_ARCHIVED", message: "Archived projects retain history but do not accept new actions or configuration changes." } },
    { status: 409 },
  );
}

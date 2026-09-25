import { NextResponse } from "next/server";
import { normalizeEntityName } from "../../../../lib/workspace-model";
import { workspaceAuditInput, recordAuditEvent } from "../../../../lib/server/audit";
import { requireApiWorkspace } from "../../../../lib/server/api-auth";
import { getWorkspaceStore } from "../../../../lib/server/workspace-store";

export async function PATCH(request: Request) {
  const auth = await requireApiWorkspace("workspace.manage");
  if (!auth.ok) return auth.response;

  let payload: { action?: unknown; name?: unknown; expectedUpdatedAt?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const action = typeof payload.action === "string" ? payload.action : "rename";
  const { store } = getWorkspaceStore();
  const current = await store.getWorkspace(auth.workspace.workspaceId);
  if (!current) return NextResponse.json({ error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace was not found." } }, { status: 404 });
  const conflict = staleSetting(payload.expectedUpdatedAt, current.updatedAt, current);
  if (conflict) return conflict;

  if (action === "archive") {
    if (auth.workspace.role !== "owner") return NextResponse.json({ error: { code: "OWNER_REQUIRED", message: "Only the workspace owner can archive the workspace." } }, { status: 403 });
    await store.archiveWorkspace(auth.workspace.workspaceId);
    await recordAuditEvent(workspaceAuditInput(auth.workspace, {
      action: "workspace.archive",
      category: "workspace",
      targetType: "workspace",
      targetId: auth.workspace.workspaceId,
      targetLabel: current.name,
      href: "/dashboard/settings#danger-zone",
      request,
      metadata: { previousStatus: current.status, nextStatus: "archived" },
    }));
    return NextResponse.json({ archived: true });
  }

  const name = normalizeEntityName(typeof payload.name === "string" ? payload.name : "");
  if (name.length < 2) return NextResponse.json({ error: { code: "INVALID_NAME", message: "Workspace name must contain at least two characters." } }, { status: 400 });
  const workspace = await store.renameWorkspace(auth.workspace.workspaceId, name);
  await recordAuditEvent(workspaceAuditInput(auth.workspace, {
    action: "workspace.rename",
    category: "workspace",
    targetType: "workspace",
    targetId: workspace.id,
    targetLabel: workspace.name,
    href: "/dashboard/settings#workspace",
    request,
    metadata: { previousName: current.name, nextName: workspace.name },
  }));
  return NextResponse.json({ workspace });
}

function staleSetting(expected: unknown, currentUpdatedAt: string, current: unknown) {
  if (typeof expected !== "string" || !expected) return null;
  if (expected === currentUpdatedAt) return null;
  return NextResponse.json({
    error: { code: "SETTINGS_CONFLICT", message: "This setting changed after the page was loaded. Refresh and review the current value before saving again." },
    current,
  }, { status: 409 });
}

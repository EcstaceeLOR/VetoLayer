import { NextResponse } from "next/server";
import { normalizeEntityName } from "../../../../lib/workspace-model";
import { workspaceAuditInput, recordAuditEvent } from "../../../../lib/server/audit";
import { requireApiWorkspace } from "../../../../lib/server/api-auth";
import { getWorkspaceStore } from "../../../../lib/server/workspace-store";

export async function PATCH(request: Request) {
  const auth = await requireApiWorkspace("workspace.manage");
  if (!auth.ok) return auth.response;

  let payload: { action?: unknown; name?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const action = typeof payload.action === "string" ? payload.action : "rename";
  const { store } = getWorkspaceStore();

  if (action === "archive") {
    if (auth.workspace.role !== "owner") return NextResponse.json({ error: { code: "OWNER_REQUIRED", message: "Only the workspace owner can archive the workspace." } }, { status: 403 });
    await store.archiveWorkspace(auth.workspace.workspaceId);
    await recordAuditEvent(workspaceAuditInput(auth.workspace, {
      action: "workspace.archive",
      category: "workspace",
      targetType: "workspace",
      targetId: auth.workspace.workspaceId,
      targetLabel: auth.workspace.workspace.name,
      href: "/dashboard/workspace",
      request,
      metadata: { previousStatus: auth.workspace.workspace.status, nextStatus: "archived" },
    }));
    return NextResponse.json({ archived: true });
  }

  const name = normalizeEntityName(typeof payload.name === "string" ? payload.name : "");
  if (name.length < 2) return NextResponse.json({ error: { code: "INVALID_NAME", message: "Workspace name must contain at least two characters." } }, { status: 400 });
  const previousName = auth.workspace.workspace.name;
  const workspace = await store.renameWorkspace(auth.workspace.workspaceId, name);
  await recordAuditEvent(workspaceAuditInput(auth.workspace, {
    action: "workspace.rename",
    category: "workspace",
    targetType: "workspace",
    targetId: workspace.id,
    targetLabel: workspace.name,
    href: "/dashboard/workspace",
    request,
    metadata: { previousName, nextName: workspace.name },
  }));
  return NextResponse.json({ workspace });
}

import { NextResponse } from "next/server";
import { normalizeEntityName } from "../../../../lib/workspace-model";
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
    return NextResponse.json({ archived: true });
  }

  const name = normalizeEntityName(typeof payload.name === "string" ? payload.name : "");
  if (name.length < 2) return NextResponse.json({ error: { code: "INVALID_NAME", message: "Workspace name must contain at least two characters." } }, { status: 400 });
  const workspace = await store.renameWorkspace(auth.workspace.workspaceId, name);
  return NextResponse.json({ workspace });
}

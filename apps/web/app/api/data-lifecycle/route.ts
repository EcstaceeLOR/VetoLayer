import { NextResponse } from "next/server";
import { requireApiWorkspace } from "../../../lib/server/api-auth";
import { recordAuditEvent, workspaceAuditInput } from "../../../lib/server/audit";
import { deletionSchedule, getDataLifecycleStore, isActiveDeletionJob, processDataLifecycleJob, transferWorkspaceOwnership } from "../../../lib/server/data-lifecycle";
import { getWorkspaceStore } from "../../../lib/server/workspace-store";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiWorkspace("workspace.manage");
  if (!auth.ok) return auth.response;
  const { store, persistence } = getDataLifecycleStore();
  const jobs = await store.listForWorkspace(auth.workspace.workspaceId, 100);
  return NextResponse.json({ jobs, persistence }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("workspace.manage");
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Data lifecycle request must be valid JSON." } }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const { store } = getDataLifecycleStore();

  if (action === "export") {
    const job = await store.create({
      workspaceId: auth.workspace.workspaceId,
      requestedByUserId: auth.workspace.userId,
      kind: "workspace_export",
      payload: { workspaceName: auth.workspace.workspace.name },
    });
    await recordAuditEvent(workspaceAuditInput(auth.workspace, {
      action: "data.export.requested", category: "settings", targetType: "workspace_export", targetId: job.id,
      targetLabel: auth.workspace.workspace.name, href: "/dashboard/data", request,
      metadata: { jobId: job.id, excludesSecrets: true },
    }));
    const completed = await processDataLifecycleJob(job.id);
    return NextResponse.json({ job: completed }, { status: completed.status === "completed" ? 201 : 202, headers: { "Cache-Control": "private, no-store" } });
  }

  if (auth.workspace.role !== "owner") {
    return NextResponse.json({ error: { code: "OWNER_REQUIRED", message: "Only the workspace owner can transfer ownership or schedule workspace removal." } }, { status: 403 });
  }

  if (action === "transfer_ownership") {
    const newOwnerUserId = String(body.newOwnerUserId ?? "").trim();
    if (!newOwnerUserId || newOwnerUserId === auth.workspace.userId) {
      return NextResponse.json({ error: { code: "INVALID_NEW_OWNER", message: "Choose a different active workspace member as the new owner." } }, { status: 400 });
    }
    const { store: workspaceStore } = getWorkspaceStore();
    const target = await workspaceStore.getMembership(auth.workspace.workspaceId, newOwnerUserId);
    if (!target) return NextResponse.json({ error: { code: "MEMBER_NOT_FOUND", message: "The selected new owner is not an active member of this workspace." } }, { status: 404 });
    await transferWorkspaceOwnership(auth.workspace.workspaceId, auth.workspace.userId, newOwnerUserId);
    await recordAuditEvent(workspaceAuditInput(auth.workspace, {
      action: "workspace.ownership.transfer", category: "workspace", targetType: "workspace_member", targetId: newOwnerUserId,
      targetLabel: target.displayName ?? target.email ?? newOwnerUserId, href: "/dashboard/data", request,
      metadata: { previousOwnerUserId: auth.workspace.userId, nextOwnerUserId: newOwnerUserId },
    }));
    return NextResponse.json({ transferred: true, newOwnerUserId });
  }

  if (action === "schedule_workspace_delete") {
    const confirmation = String(body.confirmation ?? "");
    const expected = `REMOVE WORKSPACE ${auth.workspace.workspace.name}`;
    if (confirmation !== expected) {
      return NextResponse.json({ error: { code: "DELETION_CONFIRMATION_REQUIRED", message: `Type ${expected} exactly to schedule workspace removal.` } }, { status: 400 });
    }
    const existing = (await store.listForWorkspace(auth.workspace.workspaceId, 100)).find(isActiveDeletionJob);
    if (existing) return NextResponse.json({ error: { code: "DELETION_ALREADY_SCHEDULED", message: "This workspace already has an active removal job." }, job: existing }, { status: 409 });
    const scheduledFor = deletionSchedule();
    const job = await store.create({
      workspaceId: auth.workspace.workspaceId, requestedByUserId: auth.workspace.userId, kind: "workspace_delete", scheduledFor,
      payload: { ownerUserId: auth.workspace.userId, workspaceName: auth.workspace.workspace.name },
    });
    await recordAuditEvent(workspaceAuditInput(auth.workspace, {
      action: "workspace.delete.scheduled", category: "workspace", targetType: "workspace", targetId: auth.workspace.workspaceId,
      targetLabel: auth.workspace.workspace.name, href: "/dashboard/data", request,
      metadata: { jobId: job.id, scheduledFor, recoveryWindowHours: 24, automaticPreDeletionExport: true },
    }));
    return NextResponse.json({ job }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  }

  return NextResponse.json({ error: { code: "INVALID_ACTION", message: "Choose export, transfer_ownership, or schedule_workspace_delete." } }, { status: 400 });
}

import { NextResponse } from "next/server";
import { recordUserSecurityAudit } from "../../../../lib/server/audit";
import { deletionSchedule, getDataLifecycleStore, isActiveDeletionJob, processDataLifecycleJob } from "../../../../lib/server/data-lifecycle";
import { getAuthenticatedIdentity } from "../../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../../lib/server/workspace-store";

export const runtime = "nodejs";

async function accountState() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return null;
  const { store: workspaceStore } = getWorkspaceStore();
  const memberships = await workspaceStore.listWorkspacesForUser(identity.userId);
  const ownedWorkspaces = memberships
    .filter(({ membership }) => membership.role === "owner")
    .map(({ workspace }) => ({ id: workspace.id, name: workspace.name, status: workspace.status }));
  const jobs = (await getDataLifecycleStore().store.listForUser(identity.userId, 50)).filter((job) => job.kind === "account_delete");
  return { identity, ownedWorkspaces, jobs };
}

export async function GET() {
  const state = await accountState();
  if (!state) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to manage account deletion." } }, { status: 401 });
  return NextResponse.json({ ownedWorkspaces: state.ownedWorkspaces, jobs: state.jobs }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const state = await accountState();
  if (!state) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to manage account deletion." } }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Account deletion request must be valid JSON." } }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const { store } = getDataLifecycleStore();
  const active = state.jobs.find(isActiveDeletionJob);

  if (action === "schedule") {
    if (state.ownedWorkspaces.length) {
      return NextResponse.json({ error: { code: "OWNERSHIP_TRANSFER_REQUIRED", message: "Transfer or remove every workspace you own before deleting your account." }, ownedWorkspaces: state.ownedWorkspaces }, { status: 409 });
    }
    if (active) return NextResponse.json({ error: { code: "ACCOUNT_DELETION_ALREADY_SCHEDULED", message: "Account deletion is already scheduled." }, job: active }, { status: 409 });
    if (String(body.confirmation ?? "") !== "REMOVE MY ACCOUNT") {
      return NextResponse.json({ error: { code: "DELETION_CONFIRMATION_REQUIRED", message: "Type REMOVE MY ACCOUNT exactly to schedule account deletion." } }, { status: 400 });
    }
    const scheduledFor = deletionSchedule();
    const job = await store.create({ requestedByUserId: state.identity.userId, kind: "account_delete", scheduledFor, payload: { recoveryWindowHours: 24 } });
    await recordUserSecurityAudit({
      userId: state.identity.userId,
      ...(state.identity.email ? { email: state.identity.email } : {}),
      ...(state.identity.displayName ? { displayName: state.identity.displayName } : {}),
      action: "security.account_delete.scheduled",
      metadata: { jobId: job.id, scheduledFor, recoveryWindowHours: 24, historicalReceiptsAndAuditRetained: true },
      request,
    });
    return NextResponse.json({ job }, { status: 202 });
  }

  const jobId = String(body.jobId ?? active?.id ?? "");
  const job = jobId ? await store.get(jobId) : null;
  if (!job || job.requestedByUserId !== state.identity.userId || job.kind !== "account_delete") {
    return NextResponse.json({ error: { code: "JOB_NOT_FOUND", message: "Account deletion job was not found." } }, { status: 404 });
  }

  if (action === "cancel") {
    if (!["queued", "scheduled", "failed"].includes(job.status)) return NextResponse.json({ error: { code: "JOB_NOT_CANCELLABLE", message: "This account deletion job can no longer be cancelled." }, job }, { status: 409 });
    const cancelled = await store.update(job.id, { status: "cancelled", completedAt: new Date().toISOString(), error: "" });
    await recordUserSecurityAudit({
      userId: state.identity.userId,
      ...(state.identity.email ? { email: state.identity.email } : {}),
      ...(state.identity.displayName ? { displayName: state.identity.displayName } : {}),
      action: "security.account_delete.cancelled",
      metadata: { jobId: job.id },
      request,
    });
    return NextResponse.json({ job: cancelled });
  }

  if (action === "retry") {
    if (state.ownedWorkspaces.length) return NextResponse.json({ error: { code: "OWNERSHIP_TRANSFER_REQUIRED", message: "Account deletion cannot be retried while you own a workspace." }, ownedWorkspaces: state.ownedWorkspaces }, { status: 409 });
    if (job.status !== "failed") return NextResponse.json({ error: { code: "JOB_NOT_RETRYABLE", message: "Only failed deletion jobs can be retried." }, job }, { status: 409 });
    await store.update(job.id, { status: "queued", scheduledFor: new Date().toISOString(), error: "" });
    const retried = await processDataLifecycleJob(job.id);
    return NextResponse.json({ job: retried }, { status: retried.status === "completed" ? 200 : 202 });
  }

  return NextResponse.json({ error: { code: "INVALID_ACTION", message: "Choose schedule, cancel, or retry." } }, { status: 400 });
}

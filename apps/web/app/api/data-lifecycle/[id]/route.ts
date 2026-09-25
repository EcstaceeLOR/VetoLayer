import { NextResponse } from "next/server";
import { getDataLifecycleStore, processDataLifecycleJob } from "../../../../lib/server/data-lifecycle";
import { getAuthenticatedIdentity } from "../../../../lib/server/workspace";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to inspect this job." } }, { status: 401 });
  const { id } = await params;
  const job = await getDataLifecycleStore().store.get(id);
  if (!job || job.requestedByUserId !== identity.userId) return NextResponse.json({ error: { code: "JOB_NOT_FOUND", message: "Data lifecycle job was not found." } }, { status: 404 });
  return NextResponse.json({ job }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to manage this job." } }, { status: 401 });
  const { id } = await params;
  const { store } = getDataLifecycleStore();
  const job = await store.get(id);
  if (!job || job.requestedByUserId !== identity.userId) return NextResponse.json({ error: { code: "JOB_NOT_FOUND", message: "Data lifecycle job was not found." } }, { status: 404 });

  let action = "";
  try { action = String((await request.json() as { action?: unknown }).action ?? ""); } catch {}

  if (action === "cancel") {
    if (!["queued", "scheduled", "failed"].includes(job.status)) {
      return NextResponse.json({ error: { code: "JOB_NOT_CANCELLABLE", message: "Only queued, scheduled, or failed jobs can be cancelled." }, job }, { status: 409 });
    }
    const cancelled = await store.update(job.id, { status: "cancelled", completedAt: new Date().toISOString(), error: "" });
    return NextResponse.json({ job: cancelled });
  }

  if (action === "retry") {
    if (job.status !== "failed") return NextResponse.json({ error: { code: "JOB_NOT_RETRYABLE", message: "Only failed jobs can be retried." }, job }, { status: 409 });
    await store.update(job.id, { status: "queued", scheduledFor: new Date().toISOString(), error: "" });
    const retried = await processDataLifecycleJob(job.id);
    return NextResponse.json({ job: retried }, { status: retried.status === "completed" ? 200 : 202 });
  }

  return NextResponse.json({ error: { code: "INVALID_ACTION", message: "Choose cancel or retry." } }, { status: 400 });
}

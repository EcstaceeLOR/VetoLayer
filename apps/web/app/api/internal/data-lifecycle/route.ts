import { NextResponse } from "next/server";
import { processDueDataLifecycleJobs } from "../../../../lib/server/data-lifecycle";

export const runtime = "nodejs";

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }

async function run(request: Request) {
  const secret = process.env.VETOLAYER_DATA_LIFECYCLE_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "DATA_LIFECYCLE_WORKER_NOT_CONFIGURED" }, { status: 503 });
  }
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const jobs = await processDueDataLifecycleJobs(20);
    return NextResponse.json({ processed: jobs.length, jobs: jobs.map(({ id, kind, status, attempts, error }) => ({ id, kind, status, attempts, ...(error ? { error } : {}) })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "DATA_LIFECYCLE_WORKER_FAILED" }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { getDataLifecycleStore } from "../../../../../lib/server/data-lifecycle";
import { getAuthenticatedIdentity } from "../../../../../lib/server/workspace";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to download this export." } }, { status: 401 });
  const { id } = await params;
  const job = await getDataLifecycleStore().store.get(id);
  if (!job || job.requestedByUserId !== identity.userId) return NextResponse.json({ error: { code: "JOB_NOT_FOUND", message: "Export job was not found." } }, { status: 404 });
  if (job.status !== "completed" || !job.result?.export || typeof job.result.export !== "object") {
    return NextResponse.json({ error: { code: "EXPORT_NOT_READY", message: "This export is not ready to download." }, job }, { status: 409 });
  }
  const workspaceName = String(job.payload.workspaceName ?? job.workspaceId ?? "workspace").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "workspace";
  const body = JSON.stringify(job.result.export, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="vetolayer-${workspaceName}-export.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

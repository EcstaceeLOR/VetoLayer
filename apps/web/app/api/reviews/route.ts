import { NextResponse } from "next/server";
import { requireApiWorkspace } from "../../../lib/server/api-auth";
import { getReviewStore } from "../../../lib/server/review-store";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiWorkspace("reviews.read");
  if (!auth.ok) return auth.response;
  const { store, persistence } = getReviewStore();

  try {
    const cases = await store.list(auth.workspace.workspaceId, { projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId });
    return NextResponse.json({
      cases: cases.map((item) => ({
        id: item.id,
        status: item.status,
        title: item.title,
        source: item.source,
        projectId: item.projectId,
        environmentId: item.environmentId,
        receipt: item.receipt,
        review: item.review,
        resolutionReceipt: item.resolutionReceipt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      persistence,
      scope: { workspaceId: auth.workspace.workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId },
    });
  } catch (error) {
    return NextResponse.json({ error: "REVIEW_STORE_UNAVAILABLE", message: error instanceof Error ? error.message : "Review queue is unavailable." }, { status: 503 });
  }
}

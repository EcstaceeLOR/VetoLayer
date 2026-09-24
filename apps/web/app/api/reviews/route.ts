import { NextResponse } from "next/server";
import { requireApiWorkspace } from "../../../lib/server/api-auth";
import { getReviewStore } from "../../../lib/server/review-store";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiWorkspace();
  if (!auth.ok) return auth.response;

  const { store, persistence } = getReviewStore();

  try {
    const cases = await store.list(auth.workspace.workspaceId);
    return NextResponse.json({
      cases: cases.map((item) => ({
        id: item.id,
        status: item.status,
        title: item.title,
        source: item.source,
        receipt: item.receipt,
        review: item.review,
        resolutionReceipt: item.resolutionReceipt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      persistence,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "REVIEW_STORE_UNAVAILABLE", message: error instanceof Error ? error.message : "Review queue is unavailable." },
      { status: 503 },
    );
  }
}

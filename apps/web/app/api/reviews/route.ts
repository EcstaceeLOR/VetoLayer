import { NextResponse } from "next/server";
import { readServerEnvironment } from "../../../lib/server/env";
import { getReviewStore } from "../../../lib/server/review-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const environment = readServerEnvironment();
  const workspaceId = request.headers.get("x-vetolayer-workspace")?.trim() || environment.demoWorkspaceId;
  const { store, persistence } = getReviewStore();

  try {
    const cases = await store.list(workspaceId);
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

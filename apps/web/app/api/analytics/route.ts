import { NextResponse } from "next/server";
import { dashboardDecisions } from "../../../lib/dashboard-data";
import { buildDecisionHealthOverview } from "../../../lib/decision-health";
import { getDecisionStore } from "../../../lib/server/decision-store";
import { readServerEnvironment } from "../../../lib/server/env";
import { getReviewStore } from "../../../lib/server/review-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const environment = readServerEnvironment();
  const url = new URL(request.url);
  const demo = url.searchParams.get("demo") === "1";

  if (demo) {
    return NextResponse.json(
      buildDecisionHealthOverview({
        receipts: dashboardDecisions,
        unresolvedReviews: dashboardDecisions.filter((item) => item.outcome === "REVIEW").length,
        mode: "seeded-demo",
      }),
    );
  }

  const workspaceId =
    request.headers.get("x-vetolayer-workspace")?.trim() ||
    environment.demoWorkspaceId;
  const { store, persistence } = getDecisionStore();
  const reviewStore = getReviewStore();

  try {
    const [decisions, reviews] = await Promise.all([
      store.list(workspaceId, 100),
      reviewStore.store.list(workspaceId),
    ]);
    const overview = buildDecisionHealthOverview({
      receipts: decisions.map((item) => item.receipt),
      unresolvedReviews: reviews.filter((item) => item.status === "pending").length,
      mode: "live",
    });

    return NextResponse.json({
      ...overview,
      persistence,
      reviewPersistence: reviewStore.persistence,
      workspaceId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "ANALYTICS_UNAVAILABLE",
        message:
          error instanceof Error
            ? error.message
            : "Decision health analytics are temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}

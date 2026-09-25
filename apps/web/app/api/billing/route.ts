import { NextResponse } from "next/server";
import { requireApiWorkspace } from "../../../lib/server/api-auth";
import { getCommercialSnapshot } from "../../../lib/server/commercial";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiWorkspace("decisions.read");
  if (!auth.ok) return auth.response;
  try {
    const snapshot = await getCommercialSnapshot(auth.workspace.workspaceId);
    return NextResponse.json({
      plan: snapshot.plan,
      assignment: snapshot.planRecord,
      usage: snapshot.usage,
      meters: snapshot.meters,
      persistence: snapshot.persistence,
      checkoutEnabled: false,
    });
  } catch {
    return NextResponse.json({ error: { code: "BILLING_USAGE_UNAVAILABLE", message: "Plan and usage data could not be loaded safely." } }, { status: 503 });
  }
}

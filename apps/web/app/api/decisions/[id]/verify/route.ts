import { verifyDecisionReceipt } from "@vetolayer/core";
import { NextResponse } from "next/server";
import { requireApiWorkspace } from "../../../../../lib/server/api-auth";
import { getDecisionStore } from "../../../../../lib/server/decision-store";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiWorkspace("decisions.read");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const { store } = getDecisionStore();
  try {
    const record = await store.get(auth.workspace.workspaceId, id);
    if (!record) return NextResponse.json({ error: "DECISION_NOT_FOUND" }, { status: 404 });
    const verified = await verifyDecisionReceipt(record.receipt);
    return NextResponse.json({
      receiptId: record.receipt.receiptId,
      decisionId: record.receipt.decisionId,
      verified,
      algorithm: record.receipt.integrity.algorithm,
      hash: record.receipt.integrity.hash,
      verifiedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "INTEGRITY_VERIFICATION_FAILED", message: "VetoLayer could not verify this receipt." }, { status: 503 });
  }
}

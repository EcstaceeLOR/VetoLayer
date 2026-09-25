import { verifyDecisionReceipt } from "@vetolayer/core";
import { NextResponse } from "next/server";
import { findSensitiveExportPath, renderDecisionIncidentReport } from "../../../../../lib/decision-explorer";
import { requireApiWorkspace } from "../../../../../lib/server/api-auth";
import { loadDecisionReceiptCenter } from "../../../../../lib/server/dashboard-decisions";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiWorkspace("decisions.read");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "text") return NextResponse.json({ error: "INVALID_EXPORT_FORMAT" }, { status: 400 });

  const center = await loadDecisionReceiptCenter(id);
  if (!center || center.record.workspaceId !== auth.workspace.workspaceId) return NextResponse.json({ error: "DECISION_NOT_FOUND" }, { status: 404 });
  const sensitivePath = findSensitiveExportPath(center.record.receipt);
  if (sensitivePath) {
    return NextResponse.json({ error: "EXPORT_BLOCKED_SENSITIVE_FIELD", message: "The receipt contains a field name reserved for server secrets and cannot be exported.", path: sensitivePath }, { status: 409 });
  }

  const verified = center.integrityVerified ?? await verifyDecisionReceipt(center.record.receipt);
  const safeName = center.record.receipt.receiptId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);
  if (format === "json") {
    return new Response(JSON.stringify(center.record.receipt, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const report = renderDecisionIncidentReport({
    record: center.record,
    projectName: center.projectName,
    environmentName: center.environmentName,
    integrityVerified: verified,
    reviewTimeline: center.reviewCase?.timeline,
  });
  return new Response(report, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-incident-review.txt"`,
      "Cache-Control": "private, no-store",
    },
  });
}

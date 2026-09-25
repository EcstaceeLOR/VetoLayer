import { describe, expect, it } from "vitest";
import { dashboardDecisions } from "../dashboard-data";
import { createMemoryDecisionStore } from "./decision-store";

describe("Decision Explorer store", () => {
  it("searches, filters, paginates, and preserves lineage", async () => {
    const store = createMemoryDecisionStore();
    const workspaceId = "ws_decision_explorer_test";
    const base = dashboardDecisions[0]!;
    const second = {
      ...base,
      receiptId: "receipt_decision_explorer_second",
      decisionId: "decision_decision_explorer_second",
      outcome: "BLOCK" as const,
      decisionSummary: "A later evaluation blocked the same action.",
      timestamps: {
        requestedAt: "2026-09-25T08:00:00.000Z",
        decidedAt: "2026-09-25T08:00:01.000Z",
        receiptCreatedAt: "2026-09-25T08:00:01.000Z",
      },
    };

    await store.save({
      id: base.receiptId,
      workspaceId,
      projectId: "prj_a",
      environmentId: "env_prod",
      source: "integration",
      receipt: base,
      createdAt: "2026-09-25T07:00:00.000Z",
    });
    await store.save({
      id: second.receiptId,
      workspaceId,
      projectId: "prj_a",
      environmentId: "env_prod",
      source: "integration",
      receipt: second,
      createdAt: "2026-09-25T08:00:01.000Z",
      parentReceiptId: base.receiptId,
    });

    const searched = await store.query(workspaceId, { search: "acme/api", pageSize: 1, page: 1 });
    expect(searched.total).toBe(2);
    expect(searched.decisions).toHaveLength(1);
    expect(searched.hasNext).toBe(true);

    const blocked = await store.query(workspaceId, { outcome: "BLOCK", projectId: "prj_a" });
    expect(blocked.decisions.map((item) => item.receipt.receiptId)).toEqual([second.receiptId]);

    const serv = await store.query(workspaceId, { serv: true });
    expect(serv.total).toBe(2);

    const lineage = await store.lineage(workspaceId, base.action.requestId);
    expect(lineage.map((item) => item.receipt.receiptId)).toEqual([base.receiptId, second.receiptId]);
  });

  it("indexes operational review state without changing the receipt", async () => {
    const store = createMemoryDecisionStore();
    const workspaceId = "ws_decision_review_index_test";
    const receipt = dashboardDecisions[1]!;
    await store.save({
      id: receipt.receiptId,
      workspaceId,
      projectId: "prj_reviews",
      environmentId: "env_prod",
      source: "integration",
      receipt,
      createdAt: receipt.timestamps.receiptCreatedAt,
    });

    await store.annotateReview(workspaceId, [receipt.receiptId], { state: "awaiting_evidence", reviewCaseId: "review_123" });
    const result = await store.query(workspaceId, { reviewState: "awaiting_evidence" });
    expect(result.total).toBe(1);
    expect(result.decisions[0]?.reviewCaseId).toBe("review_123");
    expect(result.decisions[0]?.receipt.integrity.hash).toBe(receipt.integrity.hash);
  });
});

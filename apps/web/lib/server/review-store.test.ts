import { describe, expect, it } from "vitest";
import type { DecisionReceipt } from "@vetolayer/core";
import { ReviewConflictError, createMemoryReviewStore, normalizeReviewCase } from "./review-store";

const receipt = {
  receiptId: "receipt-1",
  decisionId: "decision-1",
  outcome: "REVIEW",
  timestamps: { receiptCreatedAt: "2026-09-25T08:00:00.000Z" },
} as unknown as DecisionReceipt;

function reviewCase() {
  return normalizeReviewCase({
    id: "review-1",
    workspaceId: "ws-1",
    projectId: "prj-1",
    environmentId: "env-1",
    revision: 1,
    status: "pending",
    title: "Review me",
    source: "integration",
    receipt,
    context: { kind: "github", snapshot: {} as never, operation: "merge-pull-request", restrictedWindow: false },
    createdAt: "2026-09-25T08:00:00.000Z",
    updatedAt: "2026-09-25T08:00:00.000Z",
    comments: [],
    evidenceAdditions: [],
    reviewHistory: [],
    timeline: [],
    receiptLineage: [],
  });
}

describe("operational review store", () => {
  it("normalizes legacy cases into an auditable operational record", () => {
    const normalized = reviewCase();
    expect(normalized.revision).toBe(1);
    expect(normalized.dueAt).toBeTruthy();
    expect(normalized.timeline[0]?.type).toBe("created");
    expect(normalized.receiptLineage[0]?.receiptId).toBe("receipt-1");
  });

  it("rejects a stale compare-and-swap update", async () => {
    const store = createMemoryReviewStore();
    const initial = await store.save(reviewCase());
    const first = await store.save({ ...initial, title: "Reviewer A" }, { expectedRevision: 1 });
    expect(first.revision).toBe(2);
    await expect(store.save({ ...initial, title: "Reviewer B" }, { expectedRevision: 1 })).rejects.toBeInstanceOf(ReviewConflictError);
    expect((await store.get("ws-1", "review-1"))?.title).toBe("Reviewer A");
  });
});

import { describe, expect, it } from "vitest";
import { dashboardDecisions } from "./dashboard-data";
import {
  buildDecisionHealthOverview,
  evidenceCompleteness,
} from "./decision-health";

describe("decision health analytics", () => {
  it("derives operational metrics from Decision Receipts", () => {
    const overview = buildDecisionHealthOverview({
      receipts: dashboardDecisions,
      unresolvedReviews: 1,
      mode: "seeded-demo",
    });

    expect(overview.total).toBe(dashboardDecisions.length);
    expect(overview.counts.ALLOW).toBe(1);
    expect(overview.counts.REVIEW).toBe(1);
    expect(overview.counts.BLOCK).toBe(1);
    expect(overview.unresolvedReviews).toBe(1);
    expect(overview.servAssisted).toBe(2);
    expect(overview.deterministicOnly).toBe(1);
    expect(overview.tools[0]?.tool).toBe("github");
    expect(overview.topPolicies.map((item) => item.policyId)).toEqual(
      expect.arrayContaining(["github-review-required", "github-no-draft-actions"]),
    );
  });

  it("measures evidence completeness from referenced versus missing evidence", () => {
    const receipt = {
      ...dashboardDecisions[0]!,
      evidenceUsed: [],
      deterministicFindings: [
        {
          ...dashboardDecisions[0]!.deterministicFindings[0]!,
          evidenceIds: ["ev-one"],
        },
      ],
      contextualFindings: [],
      missingEvidence: [
        {
          key: "extra-proof",
          type: "approval",
          description: "Extra proof",
          required: true,
        },
      ],
    };

    expect(evidenceCompleteness(receipt)).toBe(50);
  });

  it("returns a safe empty-state snapshot with no fake production counts", () => {
    const overview = buildDecisionHealthOverview({
      receipts: [],
      unresolvedReviews: 0,
    });
    expect(overview.mode).toBe("live");
    expect(overview.total).toBe(0);
    expect(overview.counts).toEqual({ ALLOW: 0, REVIEW: 0, BLOCK: 0 });
    expect(overview.recent).toEqual([]);
  });
});

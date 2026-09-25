import { describe, expect, it } from "vitest";
import { dashboardDecisions } from "./dashboard-data";
import { compareDecisionReceipts, decisionExplorerHref, findSensitiveExportPath, parseDecisionExplorerQuery } from "./decision-explorer";

describe("Decision Explorer query state", () => {
  it("parses bounded filters and preserves them in stable URLs", () => {
    const query = parseDecisionExplorerQuery({
      q: "auth patch",
      outcome: "review",
      project: "prj_1",
      environment: "env_prod",
      source: "integration",
      tool: "github",
      policy: "github-review-required",
      serv: "yes",
      review: "awaiting_evidence",
      from: "2026-09-01",
      to: "2026-09-25",
      sort: "oldest",
      page: "3",
      pageSize: "50",
    });
    expect(query.outcome).toBe("REVIEW");
    expect(query.tool).toBe("github");
    expect(query.serv).toBe(true);
    expect(query.page).toBe(3);
    expect(query.pageSize).toBe(50);
    const href = decisionExplorerHref(query);
    expect(href).toContain("q=auth+patch");
    expect(href).toContain("tool=github");
    expect(href).toContain("review=awaiting_evidence");
    expect(href).toContain("page=3");
  });

  it("drops unsupported enum values and unsafe page sizes", () => {
    const query = parseDecisionExplorerQuery({ outcome: "DELETE", source: "unknown", serv: "maybe", page: "-8", pageSize: "999" });
    expect(query.outcome).toBeUndefined();
    expect(query.source).toBeUndefined();
    expect(query.serv).toBeUndefined();
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(25);
  });
});

describe("Receipt Center helpers", () => {
  it("builds a human-readable comparison for lineage receipts", () => {
    const before = dashboardDecisions[0]!;
    const after = { ...before, outcome: "BLOCK" as const, decisionSummary: "Later evidence blocked execution." };
    const comparison = compareDecisionReceipts(before, after);
    expect(comparison.find((row) => row.field === "Outcome")).toMatchObject({ before: "ALLOW", after: "BLOCK", changed: true });
    expect(comparison.find((row) => row.field === "Policy versions")?.changed).toBe(false);
  });

  it("blocks exports when a credential-shaped key enters receipt metadata", () => {
    expect(findSensitiveExportPath({ providerTrace: { requestId: "safe" } })).toBeNull();
    expect(findSensitiveExportPath({ providerTrace: { accessToken: "should-never-export" } })).toBe("$.providerTrace.accessToken");
  });
});

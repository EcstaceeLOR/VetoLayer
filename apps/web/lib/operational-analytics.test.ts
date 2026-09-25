import { describe, expect, it } from "vitest";
import { dashboardDecisions } from "./dashboard-data";
import { buildDecisionExplorerUrl, buildOperationalAnalytics, type AnalyticsFilters } from "./operational-analytics";
import type { AuditEvent } from "./server/audit-store";
import type { StoredDecision } from "./server/decision-store";
import type { ReviewCase } from "./server/review-store";

const filters: AnalyticsFilters = { from: "2026-09-24T00:00:00.000Z", to: "2026-09-25T23:59:59.999Z" };

function stored(index: number, overrides: Partial<StoredDecision> = {}): StoredDecision {
  const receipt = dashboardDecisions[index]!;
  return { id: receipt.receiptId, workspaceId: "ws_1", projectId: "prj_1", environmentId: "env_prod", source: "integration", receipt, createdAt: receipt.timestamps.receiptCreatedAt, ...overrides };
}

function review(overrides: Partial<ReviewCase> = {}): ReviewCase {
  const receipt = dashboardDecisions[1]!;
  return {
    id: "review_1", workspaceId: "ws_1", projectId: "prj_1", environmentId: "env_prod", revision: 2, status: "resolved", title: "Deploy production", source: "integration",
    receipt, context: {} as ReviewCase["context"], createdAt: "2026-09-24T10:00:00.000Z", updatedAt: "2026-09-24T12:00:00.000Z", dueAt: "2026-09-25T10:00:00.000Z",
    comments: [], evidenceAdditions: [], reviewHistory: [],
    timeline: [
      { id: "created", type: "created", summary: "Created", createdAt: "2026-09-24T10:00:00.000Z" },
      { id: "resolved", type: "resolved", summary: "Resolved", createdAt: "2026-09-24T12:00:00.000Z" },
    ],
    receiptLineage: [
      { receiptId: receipt.receiptId, outcome: "REVIEW", createdAt: "2026-09-24T10:00:00.000Z", reason: "initial" },
      { receiptId: "receipt_2", parentReceiptId: receipt.receiptId, outcome: "ALLOW", createdAt: "2026-09-24T12:00:00.000Z", reason: "approval" },
    ],
    ...overrides,
  };
}

function audit(action: string): AuditEvent {
  return { id: `audit_${action}`, workspaceId: "ws_1", projectId: "prj_1", environmentId: "env_prod", actorKind: "human", action, category: "integration", targetType: "integration", metadata: {}, createdAt: "2026-09-24T15:00:00.000Z" };
}

describe("operational analytics", () => {
  it("derives outcomes, policy friction and production volume while excluding demo receipts", () => {
    const report = buildOperationalAnalytics({ decisions: [stored(0), stored(1), stored(2), stored(0, { id: "demo", source: "demo" })], reviews: [], auditEvents: [], filters });
    expect(report.excludedDemoDecisions).toBe(1);
    expect(report.summary.total).toBe(3);
    expect(report.summary.outcomes).toEqual({ ALLOW: 1, REVIEW: 1, BLOCK: 1 });
    expect(report.policies.map((policy) => policy.policyId)).toEqual(expect.arrayContaining(["github-review-required", "github-no-draft-actions"]));
    expect(report.volume.projects[0]).toMatchObject({ id: "prj_1", total: 3, friction: 2 });
  });

  it("calculates review turnaround, unresolved aging and re-evaluation outcomes from review history", () => {
    const unresolved = review({ id: "review_2", status: "awaiting_evidence", createdAt: "2026-09-24T00:00:00.000Z", dueAt: "2026-09-24T08:00:00.000Z", timeline: [{ id: "created-2", type: "created", summary: "Created", createdAt: "2026-09-24T00:00:00.000Z" }], receiptLineage: [{ receiptId: "receipt_review_2", outcome: "REVIEW", createdAt: "2026-09-24T00:00:00.000Z", reason: "initial" }] });
    const report = buildOperationalAnalytics({ decisions: [], reviews: [review(), unresolved], auditEvents: [], filters, now: new Date("2026-09-25T12:00:00.000Z") });
    expect(report.reviews.created).toBe(2);
    expect(report.reviews.resolved).toBe(1);
    expect(report.reviews.averageTurnaroundHours).toBe(2);
    expect(report.reviews.unresolved).toBe(1);
    expect(report.reviews.overdue).toBe(1);
    expect(report.reviews.aging.from24to72h).toBe(1);
    expect(report.reevaluations.total).toBe(1);
    expect(report.reevaluations.outcomes.ALLOW).toBe(1);
    expect(report.reevaluations.reasons.approval).toBe(1);
  });

  it("aggregates only safe SERV latency and usage metadata", () => {
    const receipt = { ...dashboardDecisions[0]!, providerTrace: { provider: "openserv-serv", providerStatus: "fallback", endpoint: "https://secret-provider.example/api", model: "private-model-name", requestId: "provider-private-id", latencyMs: 240, usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } } };
    const report = buildOperationalAnalytics({ decisions: [stored(0, { receipt })], reviews: [], auditEvents: [], filters });
    expect(report.reasoning.servAssisted).toBe(1);
    expect(report.reasoning.servFallbacks).toBe(1);
    expect(report.reasoning.averageLatencyMs).toBe(240);
    expect(report.reasoning.usage).toEqual({ samples: 1, promptTokens: 100, completionTokens: 20, totalTokens: 120 });
    expect(JSON.stringify(report)).not.toContain("secret-provider");
    expect(JSON.stringify(report)).not.toContain("private-model-name");
    expect(JSON.stringify(report)).not.toContain("provider-private-id");
  });

  it("derives integration failure rates from persisted audit events", () => {
    const report = buildOperationalAnalytics({ decisions: [], reviews: [], auditEvents: [audit("integration.github.connected"), audit("integration.github.failed"), audit("integration.github.disconnected")], filters });
    expect(report.integrations).toEqual({ events: 3, failures: 1, disconnects: 1, failureRate: 33.33 });
  });

  it("applies project, environment and date filters consistently", () => {
    const outOfScope = stored(0, { id: "other", projectId: "prj_other", environmentId: "env_other" });
    const outOfWindow = stored(0, { id: "old", createdAt: "2026-08-01T00:00:00.000Z" });
    const report = buildOperationalAnalytics({ decisions: [stored(0), outOfScope, outOfWindow], reviews: [], auditEvents: [], filters: { ...filters, projectId: "prj_1", environmentId: "env_prod" } });
    expect(report.summary.total).toBe(1);
    expect(report.volume.projects).toHaveLength(1);
  });

  it("degrades to explicit zero/empty metrics with no persisted activity", () => {
    const report = buildOperationalAnalytics({ decisions: [], reviews: [], auditEvents: [], filters });
    expect(report.summary.total).toBe(0);
    expect(report.trend).toEqual([]);
    expect(report.reasoning.averageLatencyMs).toBeNull();
    expect(report.reviews.averageTurnaroundHours).toBeNull();
    expect(report.evidence.topMissing).toEqual([]);
  });

  it("builds Decision Explorer drill-downs using the existing URL contract", () => {
    const url = buildDecisionExplorerUrl({ ...filters, projectId: "prj_1", environmentId: "env_prod" }, { outcome: "BLOCK", policy: "policy_1", serv: "true" });
    expect(url).toContain("project=prj_1");
    expect(url).toContain("environment=env_prod");
    expect(url).toContain("outcome=BLOCK");
    expect(url).toContain("policy=policy_1");
    expect(url).toContain("serv=yes");
    expect(url).toContain("from=2026-09-24");
    expect(url).not.toContain("projectId=");
  });
});

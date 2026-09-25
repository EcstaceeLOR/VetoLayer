import { NextResponse } from "next/server";
import type { OperationalAnalyticsReport } from "../../../../lib/operational-analytics";
import { requireApiWorkspace } from "../../../../lib/server/api-auth";
import { loadOperationalAnalytics, parseAnalyticsFilters } from "../../../../lib/server/operational-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportRow = { section: string; metric: string; dimension: string; value: string | number };

function rowsFor(report: OperationalAnalyticsReport): ReportRow[] {
  const rows: ReportRow[] = [
    { section: "summary", metric: "decisions", dimension: "all", value: report.summary.total },
    { section: "summary", metric: "outcome", dimension: "ALLOW", value: report.summary.outcomes.ALLOW },
    { section: "summary", metric: "outcome", dimension: "REVIEW", value: report.summary.outcomes.REVIEW },
    { section: "summary", metric: "outcome", dimension: "BLOCK", value: report.summary.outcomes.BLOCK },
    { section: "summary", metric: "friction_rate_percent", dimension: "all", value: report.summary.frictionRate },
    { section: "summary", metric: "friction_rate_delta_points", dimension: "all", value: report.summary.frictionRateDelta },
    { section: "reviews", metric: "created", dimension: "all", value: report.reviews.created },
    { section: "reviews", metric: "resolved", dimension: "all", value: report.reviews.resolved },
    { section: "reviews", metric: "unresolved", dimension: "all", value: report.reviews.unresolved },
    { section: "reviews", metric: "overdue", dimension: "all", value: report.reviews.overdue },
    { section: "reviews", metric: "average_turnaround_hours", dimension: "all", value: report.reviews.averageTurnaroundHours ?? "" },
    { section: "reviews", metric: "median_turnaround_hours", dimension: "all", value: report.reviews.medianTurnaroundHours ?? "" },
    { section: "evidence", metric: "average_completeness_percent", dimension: "all", value: report.evidence.averageCompleteness },
    { section: "evidence", metric: "decisions_missing_evidence", dimension: "all", value: report.evidence.decisionsMissingEvidence },
    { section: "evidence", metric: "missing_requirements", dimension: "all", value: report.evidence.totalMissingRequirements },
    { section: "reasoning", metric: "deterministic_only", dimension: "all", value: report.reasoning.deterministicOnly },
    { section: "reasoning", metric: "serv_assisted", dimension: "all", value: report.reasoning.servAssisted },
    { section: "reasoning", metric: "serv_ratio_percent", dimension: "all", value: report.reasoning.servRatio },
    { section: "reasoning", metric: "serv_fallbacks", dimension: "all", value: report.reasoning.servFallbacks },
    { section: "reasoning", metric: "serv_fallback_rate_percent", dimension: "all", value: report.reasoning.servFallbackRate },
    { section: "reasoning", metric: "serv_average_latency_ms", dimension: "all", value: report.reasoning.averageLatencyMs ?? "" },
    { section: "reasoning", metric: "serv_p95_latency_ms", dimension: "all", value: report.reasoning.p95LatencyMs ?? "" },
    { section: "reasoning", metric: "usage_total_tokens", dimension: "all", value: report.reasoning.usage.totalTokens ?? "" },
    { section: "reevaluation", metric: "total", dimension: "all", value: report.reevaluations.total },
    { section: "reevaluation", metric: "outcome", dimension: "ALLOW", value: report.reevaluations.outcomes.ALLOW },
    { section: "reevaluation", metric: "outcome", dimension: "REVIEW", value: report.reevaluations.outcomes.REVIEW },
    { section: "reevaluation", metric: "outcome", dimension: "BLOCK", value: report.reevaluations.outcomes.BLOCK },
    { section: "integrations", metric: "events", dimension: "all", value: report.integrations.events },
    { section: "integrations", metric: "failures", dimension: "all", value: report.integrations.failures },
    { section: "integrations", metric: "disconnects", dimension: "all", value: report.integrations.disconnects },
    { section: "integrations", metric: "failure_rate_percent", dimension: "all", value: report.integrations.failureRate },
  ];
  for (const point of report.trend) {
    rows.push(
      { section: "trend", metric: "decisions", dimension: point.label, value: point.total },
      { section: "trend", metric: "ALLOW", dimension: point.label, value: point.ALLOW },
      { section: "trend", metric: "REVIEW", dimension: point.label, value: point.REVIEW },
      { section: "trend", metric: "BLOCK", dimension: point.label, value: point.BLOCK },
      { section: "trend", metric: "evidence_completeness_percent", dimension: point.label, value: point.evidenceCompleteness },
      { section: "trend", metric: "missing_evidence", dimension: point.label, value: point.missingEvidence },
    );
  }
  for (const policy of report.policies) {
    rows.push(
      { section: "policy", metric: "friction_total", dimension: `${policy.policyId} · ${policy.name}`, value: policy.total },
      { section: "policy", metric: "review", dimension: policy.policyId, value: policy.review },
      { section: "policy", metric: "block", dimension: policy.policyId, value: policy.block },
    );
  }
  for (const item of report.evidence.topMissing) rows.push({ section: "evidence", metric: "missing_requirement", dimension: `${item.key} · ${item.description}`, value: item.count });
  for (const item of report.volume.projects) rows.push({ section: "volume", metric: "project_decisions", dimension: item.id, value: item.total });
  for (const item of report.volume.environments) rows.push({ section: "volume", metric: "environment_decisions", dimension: item.id, value: item.total });
  for (const item of report.volume.integrations) rows.push({ section: "volume", metric: "execution_channel_decisions", dimension: item.label, value: item.total });
  return rows;
}

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  const auth = await requireApiWorkspace("decisions.read");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  try {
    const filters = parseAnalyticsFilters(url.searchParams);
    const data = await loadOperationalAnalytics(auth.workspace.workspaceId, filters);
    const filename = `vetolayer-operational-analytics-${data.report.filters.from.slice(0, 10)}-${data.report.filters.to.slice(0, 10)}`;
    if (format === "json") {
      return new NextResponse(JSON.stringify({ generatedAt: new Date().toISOString(), report: data.report }, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.json"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    const csv = ["section,metric,dimension,value", ...rowsFor(data.report).map((row) => [row.section, row.metric, row.dimension, row.value].map(escapeCsv).join(","))].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: { code: "ANALYTICS_EXPORT_UNAVAILABLE", message: "The filtered analytics report could not be generated." } }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

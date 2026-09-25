import Link from "next/link";
import { Badge, EmptyState, Notice } from "../../../components/ui/primitives";
import { buildDecisionExplorerUrl } from "../../../lib/operational-analytics";
import { analyticsFilterQuery, loadOperationalAnalytics, parseAnalyticsFilters } from "../../../lib/server/operational-analytics";
import { getAuthenticatedWorkspace } from "../../../lib/server/workspace";
import "./analytics.css";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function asUrlSearchParams(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(input)) {
    const value = first(raw);
    if (value) params.set(key, value);
  }
  return params;
}
function hours(value: number | null) { return value === null ? "—" : `${value.toLocaleString()}h`; }
function pct(value: number) { return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`; }
function number(value: number | null) { return value === null ? "—" : value.toLocaleString(); }
function dateValue(value: string) { return value.slice(0, 10); }

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) return <EmptyState title="Workspace required" copy="Select an active workspace before opening operational analytics." />;

  const raw = await searchParams;
  const filters = parseAnalyticsFilters(asUrlSearchParams(raw));
  let data;
  try {
    data = await loadOperationalAnalytics(workspace.workspaceId, filters);
  } catch {
    return <EmptyState title="Analytics unavailable" copy="VetoLayer could not load persisted reporting data. Verify product persistence and try again." />;
  }

  const { report } = data;
  const projectNames = new Map(data.projects.map((project) => [project.id, project.name]));
  const environmentNames = new Map(data.environments.map((environment) => [environment.id, environment.name]));
  const availableEnvironments = data.environments.filter((environment) => !report.filters.projectId || environment.projectId === report.filters.projectId);
  const query = analyticsFilterQuery(report.filters);
  const maxTrend = Math.max(1, ...report.trend.map((point) => point.total));
  const frictionDirection = report.summary.frictionRateDelta > 0 ? "up" : report.summary.frictionRateDelta < 0 ? "down" : "flat";

  return (
    <>
      <header className="dashboardHeader compactHeader analyticsHeader">
        <div>
          <div className="headerModeRow"><p className="vlEyebrow">OPERATIONAL ANALYTICS</p><Badge tone="success">Persisted product data</Badge></div>
          <h1 className="dashboardTitle">Understand why governance friction is changing.</h1>
          <p className="dashboardIntro">Track outcomes, policy pressure, review performance, evidence quality, reasoning paths, re-evaluations, and integration reliability across one consistent reporting scope.</p>
        </div>
        <div className="analyticsExportActions">
          <a className="vlButton vlButtonSecondary" href={`/api/analytics/export?format=csv&${query}`}>Export CSV</a>
          <a className="vlButton vlButtonGhost" href={`/api/analytics/export?format=json&${query}`}>Export JSON</a>
        </div>
      </header>

      <section className="analyticsFilterShell vlCard">
        <div className="analyticsPresetRow" aria-label="Date range presets">
          <span>Quick range</span>
          {[7, 30, 90, 180, 365].map((days) => <Link key={days} href={`/dashboard/analytics?range=${days}${report.filters.projectId ? `&projectId=${encodeURIComponent(report.filters.projectId)}` : ""}${report.filters.environmentId ? `&environmentId=${encodeURIComponent(report.filters.environmentId)}` : ""}`}>{days}d</Link>)}
        </div>
        <form method="get" className="analyticsFilters">
          <label><span>From</span><input type="date" name="from" defaultValue={dateValue(report.filters.from)} /></label>
          <label><span>To</span><input type="date" name="to" defaultValue={dateValue(report.filters.to)} /></label>
          <label><span>Project</span><select name="projectId" defaultValue={report.filters.projectId ?? ""}><option value="">All projects</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.status === "archived" ? " · archived" : ""}</option>)}</select></label>
          <label><span>Environment</span><select name="environmentId" defaultValue={report.filters.environmentId ?? ""}><option value="">All environments</option>{availableEnvironments.map((environment) => <option key={environment.id} value={environment.id}>{projectNames.get(environment.projectId) ?? "Project"} · {environment.name}{environment.status === "archived" ? " · archived" : ""}</option>)}</select></label>
          <button type="submit" className="vlButton vlButtonPrimary">Apply report</button>
        </form>
      </section>

      {report.truncated ? <Notice tone="warning" title="Decision scan bounded">This online report loaded the newest 5,000 matching persisted decisions. Narrow the date/project/environment scope for exact totals.</Notice> : null}
      {report.auditTruncated ? <Notice tone="warning" title="Integration event scan bounded">Integration reliability is based on the first 5,000 matching audit events. Narrow the report scope for exact event rates.</Notice> : null}
      {!data.auditAvailable ? <Notice tone="warning" title="Integration event analytics unavailable">Decision and review analytics are available, but the audit source could not be read for integration failure rates.</Notice> : null}

      {report.summary.total === 0 && report.reviews.created === 0 ? (
        <EmptyState
          eyebrow="No production activity in scope"
          title="There is nothing to report for this window yet."
          copy="Expand the date range or generate governed decisions to populate this report."
          action={<Link className="vlButton vlButtonPrimary" href="/dashboard/decisions">Open Decision Explorer</Link>}
        />
      ) : (
        <>
          <section className="analyticsMetricGrid" aria-label="Operational summary">
            <Link href={buildDecisionExplorerUrl(report.filters)} className="analyticsMetric vlCard vlCardInteractive"><span>Decisions</span><strong>{report.summary.total.toLocaleString()}</strong><small>production receipts in scope</small></Link>
            <Link href={buildDecisionExplorerUrl(report.filters, { outcome: "ALLOW" })} className="analyticsMetric vlCard vlCardInteractive"><span>ALLOW</span><strong>{report.summary.outcomes.ALLOW.toLocaleString()}</strong><small>{pct(report.summary.total ? report.summary.outcomes.ALLOW / report.summary.total * 100 : 0)} of decisions</small></Link>
            <Link href={buildDecisionExplorerUrl(report.filters, { outcome: "REVIEW" })} className="analyticsMetric vlCard vlCardInteractive"><span>REVIEW</span><strong>{report.summary.outcomes.REVIEW.toLocaleString()}</strong><small>human judgment required</small></Link>
            <Link href={buildDecisionExplorerUrl(report.filters, { outcome: "BLOCK" })} className="analyticsMetric vlCard vlCardInteractive"><span>BLOCK</span><strong>{report.summary.outcomes.BLOCK.toLocaleString()}</strong><small>execution stopped</small></Link>
            <article className="analyticsMetric vlCard"><span>Governance friction</span><strong>{pct(report.summary.frictionRate)}</strong><small className={`frictionDelta ${frictionDirection}`}>{report.summary.frictionRateDelta > 0 ? "+" : ""}{report.summary.frictionRateDelta.toFixed(2)} pts vs earlier half</small></article>
            <Link href="/dashboard/reviews" className="analyticsMetric vlCard vlCardInteractive"><span>Unresolved reviews</span><strong>{report.reviews.unresolved.toLocaleString()}</strong><small>{report.reviews.overdue.toLocaleString()} overdue in selected cohort</small></Link>
          </section>

          <section className="analyticsSection vlCard">
            <div className="analyticsSectionHeading"><div><p className="vlEyebrow">OUTCOME TREND</p><h2>ALLOW / REVIEW / BLOCK over time</h2><p>Every bar uses the same report scope. Evidence health is shown beside the outcome mix so rising friction can be compared with missing context.</p></div><Link href={buildDecisionExplorerUrl(report.filters)}>Inspect source decisions →</Link></div>
            {report.trend.length ? <div className="analyticsTrend" role="list">
              {report.trend.map((point) => <div className="analyticsTrendRow" key={point.key} role="listitem">
                <div className="trendLabel"><strong>{point.label}</strong><small>{point.total} decisions · {point.evidenceCompleteness}% evidence · {point.missingEvidence} missing</small></div>
                <div className="trendBar" aria-label={`${point.label}: ${point.ALLOW} allow, ${point.REVIEW} review, ${point.BLOCK} block`}>
                  <span className="trendAllow" style={{ width: `${point.ALLOW / maxTrend * 100}%` }} />
                  <span className="trendReview" style={{ width: `${point.REVIEW / maxTrend * 100}%` }} />
                  <span className="trendBlock" style={{ width: `${point.BLOCK / maxTrend * 100}%` }} />
                </div>
                <div className="trendCounts"><span>{point.ALLOW} A</span><span>{point.REVIEW} R</span><span>{point.BLOCK} B</span></div>
              </div>)}
            </div> : <p className="analyticsEmpty">No decision trend is available for this scope.</p>}
          </section>

          <div className="analyticsTwoColumn">
            <section className="analyticsSection vlCard">
              <div className="analyticsSectionHeading"><div><p className="vlEyebrow">POLICY FRICTION</p><h2>What is driving REVIEW and BLOCK?</h2></div></div>
              {report.policies.length ? <div className="analyticsTable">
                <div className="analyticsTableHead"><span>Policy</span><span>Review</span><span>Block</span><span>Total</span></div>
                {report.policies.map((policy) => <Link className="analyticsTableRow" key={policy.policyId} href={buildDecisionExplorerUrl(report.filters, { policy: policy.policyId })}><span><strong>{policy.name}</strong><small className="mono">{policy.policyId}</small></span><b>{policy.review}</b><b>{policy.block}</b><b>{policy.total}</b></Link>)}
              </div> : <p className="analyticsEmpty">No failed or uncertain policy findings in this window.</p>}
            </section>

            <section className="analyticsSection vlCard">
              <div className="analyticsSectionHeading"><div><p className="vlEyebrow">EVIDENCE HEALTH</p><h2>{report.evidence.averageCompleteness}% average completeness</h2></div><Link href={buildDecisionExplorerUrl(report.filters)}>Inspect evidence trails →</Link></div>
              <div className="analyticsInlineStats"><span><strong>{report.evidence.decisionsMissingEvidence}</strong> decisions missing evidence</span><span><strong>{report.evidence.totalMissingRequirements}</strong> missing requirements</span></div>
              {report.evidence.topMissing.length ? <div className="analyticsRankedList">{report.evidence.topMissing.map((item) => <div key={item.key}><span><strong>{item.description}</strong><small className="mono">{item.key}</small></span><b>{item.count}</b></div>)}</div> : <p className="analyticsEmpty">No missing evidence requirements in this window.</p>}
            </section>
          </div>

          <div className="analyticsTwoColumn">
            <section className="analyticsSection vlCard">
              <div className="analyticsSectionHeading"><div><p className="vlEyebrow">HUMAN REVIEW</p><h2>Turnaround and unresolved aging</h2><p>Review metrics use cases created in the selected date range and the selected project/environment scope.</p></div><Link href="/dashboard/reviews">Open review queue →</Link></div>
              <div className="analyticsReviewStats">
                <span><small>Created</small><strong>{report.reviews.created}</strong></span>
                <span><small>Resolved</small><strong>{report.reviews.resolved}</strong></span>
                <span><small>Avg turnaround</small><strong>{hours(report.reviews.averageTurnaroundHours)}</strong></span>
                <span><small>Median turnaround</small><strong>{hours(report.reviews.medianTurnaroundHours)}</strong></span>
              </div>
              <div className="agingGrid"><span><small>&lt; 4h</small><strong>{report.reviews.aging.under4h}</strong></span><span><small>4–24h</small><strong>{report.reviews.aging.from4to24h}</strong></span><span><small>24–72h</small><strong>{report.reviews.aging.from24to72h}</strong></span><span><small>72h+</small><strong>{report.reviews.aging.over72h}</strong></span></div>
            </section>

            <section className="analyticsSection vlCard">
              <div className="analyticsSectionHeading"><div><p className="vlEyebrow">RE-EVALUATION</p><h2>What happens after people add context?</h2></div></div>
              <div className="analyticsReviewStats"><span><small>Total</small><strong>{report.reevaluations.total}</strong></span><span><small>→ ALLOW</small><strong>{report.reevaluations.outcomes.ALLOW}</strong></span><span><small>→ REVIEW</small><strong>{report.reevaluations.outcomes.REVIEW}</strong></span><span><small>→ BLOCK</small><strong>{report.reevaluations.outcomes.BLOCK}</strong></span></div>
              <div className="analyticsInlineStats"><span><strong>{report.reevaluations.reasons.evidenceChange}</strong> evidence changes</span><span><strong>{report.reevaluations.reasons.approval}</strong> approvals</span><span><strong>{report.reevaluations.reasons.rejection}</strong> rejections</span></div>
            </section>
          </div>

          <div className="analyticsTwoColumn">
            <section className="analyticsSection vlCard">
              <div className="analyticsSectionHeading"><div><p className="vlEyebrow">REASONING PATH</p><h2>Deterministic vs SERV-assisted</h2></div><Link href={buildDecisionExplorerUrl(report.filters, { serv: "true" })}>SERV-assisted receipts →</Link></div>
              <div className="reasoningSplit"><div style={{ width: `${100 - report.reasoning.servRatio}%` }} className="reasoningDeterministic" /><div style={{ width: `${report.reasoning.servRatio}%` }} className="reasoningServ" /></div>
              <div className="analyticsInlineStats"><span><strong>{report.reasoning.deterministicOnly}</strong> deterministic-only</span><span><strong>{report.reasoning.servAssisted}</strong> SERV-assisted ({pct(report.reasoning.servRatio)})</span><span><strong>{report.reasoning.servFallbacks}</strong> fallbacks ({pct(report.reasoning.servFallbackRate)})</span></div>
              <div className="analyticsReviewStats"><span><small>Avg SERV latency</small><strong>{report.reasoning.averageLatencyMs === null ? "—" : `${report.reasoning.averageLatencyMs}ms`}</strong></span><span><small>P95 latency</small><strong>{report.reasoning.p95LatencyMs === null ? "—" : `${report.reasoning.p95LatencyMs}ms`}</strong></span><span><small>Usage samples</small><strong>{report.reasoning.usage.samples}</strong></span><span><small>Total tokens</small><strong>{number(report.reasoning.usage.totalTokens)}</strong></span></div>
              <p className="analyticsPrivacyNote">Only aggregate provider status, latency, and token counts are reported. Provider endpoints, models, request IDs, prompts, responses, and evidence payloads are not exposed here.</p>
            </section>

            <section className="analyticsSection vlCard">
              <div className="analyticsSectionHeading"><div><p className="vlEyebrow">INTEGRATION RELIABILITY</p><h2>Failures and disconnects</h2><p>Derived from persisted integration-category audit events in the selected scope.</p></div><Link href={`/dashboard/audit?action=integration&from=${encodeURIComponent(report.filters.from)}&to=${encodeURIComponent(report.filters.to)}`}>Open audit history →</Link></div>
              <div className="analyticsReviewStats"><span><small>Events</small><strong>{report.integrations.events}</strong></span><span><small>Failures</small><strong>{report.integrations.failures}</strong></span><span><small>Disconnects</small><strong>{report.integrations.disconnects}</strong></span><span><small>Failure rate</small><strong>{pct(report.integrations.failureRate)}</strong></span></div>
            </section>
          </div>

          <section className="analyticsSection vlCard">
            <div className="analyticsSectionHeading"><div><p className="vlEyebrow">VOLUME</p><h2>Where governed actions originate</h2></div></div>
            <div className="volumeColumns">
              <VolumeList title="Projects" rows={report.volume.projects.map((row) => ({ key: row.id, label: projectNames.get(row.id) ?? row.id, total: row.total, friction: row.friction, href: buildDecisionExplorerUrl({ ...report.filters, projectId: row.id, environmentId: undefined }) }))} />
              <VolumeList title="Environments" rows={report.volume.environments.map((row) => ({ key: row.id, label: environmentNames.get(row.id) ?? row.id, total: row.total, friction: row.friction, href: buildDecisionExplorerUrl({ ...report.filters, environmentId: row.id }) }))} />
              <VolumeList title="Execution channels" rows={report.volume.integrations.map((row) => ({ key: row.key, label: row.label, total: row.total, friction: row.friction, href: buildDecisionExplorerUrl(report.filters, row.key === "api" ? { source: "api" } : { tool: row.label }) }))} />
            </div>
          </section>

          <footer className="analyticsFootnote">Sources: {data.persistence.decisions} decisions · {data.persistence.reviews} reviews · {data.persistence.audit} audit events. All production analytics exclude seeded example receipts.</footer>
        </>
      )}
    </>
  );
}

function VolumeList({ title, rows }: { title: string; rows: Array<{ key: string; label: string; total: number; friction: number; href: string }> }) {
  return <div className="volumeList"><h3>{title}</h3>{rows.length ? rows.slice(0, 8).map((row) => <Link key={row.key} href={row.href}><span><strong>{row.label}</strong><small>{row.friction} REVIEW/BLOCK</small></span><b>{row.total}</b></Link>) : <p className="analyticsEmpty">No activity</p>}</div>;
}

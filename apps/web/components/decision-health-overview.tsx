"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DecisionHealthOverview } from "../lib/decision-health";

type HealthResponse = DecisionHealthOverview & {
  persistence?: string;
  reviewPersistence?: string;
  workspaceId?: string;
};

export function DecisionHealthOverviewPanel() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [mode, setMode] = useState<"live" | "demo">("live");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextMode = mode) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/analytics${nextMode === "demo" ? "?demo=1" : ""}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Decision health is unavailable.");
      setData(payload as HealthResponse);
      setMode(nextMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Decision health is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load("live"); }, []);

  const outcomePercentages = useMemo(() => {
    if (!data?.total) return { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
    return {
      ALLOW: Math.round((data.counts.ALLOW / data.total) * 100),
      REVIEW: Math.round((data.counts.REVIEW / data.total) * 100),
      BLOCK: Math.round((data.counts.BLOCK / data.total) * 100),
    };
  }, [data]);

  if (loading && !data) {
    return <div className="healthLoading"><span className="pulse" /> Loading real decision health…</div>;
  }

  if (error && !data) {
    return <div className="healthError"><strong>Decision health unavailable</strong><p>{error}</p><button onClick={() => load("live")}>Retry</button></div>;
  }

  if (!data) return null;

  return (
    <div className="healthOverview">
      <div className="healthToolbar">
        <div>
          <span className={data.mode === "seeded-demo" ? "healthSource demo" : "healthSource"}>
            {data.mode === "seeded-demo" ? "SEEDED DEMO DATA" : "LIVE DECISION DATA"}
          </span>
          <small>{data.mode === "seeded-demo" ? "Clearly identified sample receipts" : `${data.workspaceId ?? "workspace"} · ${data.persistence ?? "runtime"} storage`}</small>
        </div>
        <div className="healthActions">
          <button className={mode === "live" ? "active" : ""} onClick={() => load("live")} disabled={loading}>Live</button>
          <button className={mode === "demo" ? "active" : ""} onClick={() => load("demo")} disabled={loading}>Demo data</button>
          <button onClick={() => load(mode)} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>

      {data.total === 0 ? (
        <EmptyHealthState onDemo={() => load("demo")} />
      ) : (
        <>
          <section className="healthMetricGrid" aria-label="VetoLayer decision health metrics">
            <article><span>Governed actions</span><strong>{data.total}</strong><small>recent Decision Receipts</small></article>
            <article className="reviewMetric"><span>Open reviews</span><strong>{data.unresolvedReviews}</strong><small>{data.unresolvedReviews ? "human judgment pending" : "nothing waiting"}</small></article>
            <article><span>Evidence health</span><strong>{data.averageEvidenceCompleteness}%</strong><small>recent completeness proxy</small></article>
            <article className="servMetric"><span>SERV-assisted</span><strong>{data.servAssisted}</strong><small>{data.deterministicOnly} deterministic-only</small></article>
          </section>

          <section className="healthGrid">
            <article className="healthPanel outcomeHealth">
              <div className="healthPanelHead"><div><span>DECISION MIX</span><h3>How actions are resolving</h3></div><Link href="/dashboard/decisions">All decisions →</Link></div>
              <div className="outcomeHealthBar" aria-label="Outcome distribution">
                <span className="allow" style={{ width: `${outcomePercentages.ALLOW}%` }} />
                <span className="review" style={{ width: `${outcomePercentages.REVIEW}%` }} />
                <span className="block" style={{ width: `${outcomePercentages.BLOCK}%` }} />
              </div>
              <div className="outcomeLegend">
                <div><i className="allow" /><span>ALLOW</span><strong>{data.counts.ALLOW}</strong><small>{outcomePercentages.ALLOW}%</small></div>
                <div><i className="review" /><span>REVIEW</span><strong>{data.counts.REVIEW}</strong><small>{outcomePercentages.REVIEW}%</small></div>
                <div><i className="block" /><span>BLOCK</span><strong>{data.counts.BLOCK}</strong><small>{outcomePercentages.BLOCK}%</small></div>
              </div>
              {data.providerFallbacks ? <div className="providerWarning">{data.providerFallbacks} contextual evaluation{data.providerFallbacks === 1 ? "" : "s"} used fail-safe provider fallback.</div> : <div className="providerHealthy">No SERV provider fallback recorded in this window.</div>}
            </article>

            <article className="healthPanel policyFriction">
              <div className="healthPanelHead"><div><span>POLICY FRICTION</span><h3>What is stopping autonomy</h3></div><Link href="/dashboard/policies">Policy Studio →</Link></div>
              {data.topPolicies.length ? (
                <div className="frictionList">
                  {data.topPolicies.map((policy, index) => (
                    <Link href="/dashboard/policies" className="frictionRow" key={policy.policyId}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div><strong>{policy.policyId}</strong><small>{policy.reviewCount} review · {policy.blockCount} block</small></div>
                      <b>{policy.count}</b>
                    </Link>
                  ))}
                </div>
              ) : <p className="healthMuted">No REVIEW/BLOCK policy friction in this window.</p>}
            </article>
          </section>

          <section className="healthGrid lowerHealthGrid">
            <article className="healthPanel evidenceHealth">
              <div className="healthPanelHead"><div><span>EVIDENCE COMPLETENESS</span><h3>Are decisions getting enough proof?</h3></div><span className="healthHeadlineNumber">{data.averageEvidenceCompleteness}%</span></div>
              <div className="evidenceTrendList">
                {data.evidenceTrend.map((item) => (
                  <Link href={`/dashboard/decisions/${encodeURIComponent(item.receiptId)}`} className="evidenceTrendRow" key={item.receiptId}>
                    <span className={`miniOutcome ${item.outcome.toLowerCase()}`}>{item.outcome.slice(0, 1)}</span>
                    <div className="evidenceMeter"><i style={{ width: `${item.completeness}%` }} className={item.completeness < 100 ? "incomplete" : ""} /></div>
                    <strong>{item.completeness}%</strong>
                  </Link>
                ))}
              </div>
              <p className="metricDefinition">Completeness compares evidence referenced by the receipt with evidence explicitly recorded as missing. It is an operational signal, not a compliance score.</p>
            </article>

            <article className="healthPanel toolHealth">
              <div className="healthPanelHead"><div><span>INTEGRATION LOAD</span><h3>Where actions originate</h3></div><Link href="/dashboard/integrations">Integrations →</Link></div>
              <div className="toolList">
                {data.tools.map((tool) => {
                  const percentage = Math.round((tool.count / data.total) * 100);
                  return <div className="toolRow" key={tool.tool}><div><strong>{tool.tool}</strong><span>{tool.count} action{tool.count === 1 ? "" : "s"}</span></div><div className="toolMeter"><i style={{ width: `${percentage}%` }} /></div><b>{percentage}%</b></div>;
                })}
              </div>
            </article>
          </section>

          <section className="dashboardSection healthRecent">
            <div className="sectionHeading"><div><p className="eyebrow">RECENT GOVERNANCE</p><h2>Actions behind the health signals</h2></div><Link className="sectionTextLink" href="/dashboard/decisions">Open decision history →</Link></div>
            <div className="decisionTable" role="table" aria-label="Recent governed actions">
              <div className="decisionTableHead" role="row"><span>Action</span><span>Outcome</span><span>Reasoning</span><span>Evidence</span><span /></div>
              {data.recent.map((item) => (
                <div className="decisionTableRow" role="row" key={item.receiptId}>
                  <div><strong>{humanize(item.operation)}</strong><small>{item.tool} · {item.target}</small></div>
                  <span className={`outcomeBadge ${item.outcome.toLowerCase()}`}>{item.outcome}</span>
                  <div className="reasoningMode"><span>{item.servAssisted ? "Deterministic + SERV" : "Deterministic"}</span><small>{item.servAssisted ? "contextual judgment" : "SERV not required"}</small></div>
                  <span className={item.missingEvidence ? "evidenceStatus missing" : "evidenceStatus"}>{item.missingEvidence ? `${item.missingEvidence} missing` : "Complete"}</span>
                  <Link className="rowLink" href={`/dashboard/decisions/${encodeURIComponent(data.mode === "seeded-demo" ? item.decisionId : item.receiptId)}`}>Inspect →</Link>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function EmptyHealthState({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="healthEmpty">
      <span className="healthEmptyOrb">0</span>
      <h2>No real decisions yet.</h2>
      <p>VetoLayer will build this health overview from actual Decision Receipts as agents begin submitting actions. Nothing is fabricated in live mode.</p>
      <div><Link className="primaryButton" href="/demo">Run the flagship evaluation →</Link><button className="secondaryButton buttonReset" onClick={onDemo}>Preview clearly labeled demo data</button></div>
    </section>
  );
}

function humanize(value: string) {
  return value.split("-").map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : part).join(" ");
}

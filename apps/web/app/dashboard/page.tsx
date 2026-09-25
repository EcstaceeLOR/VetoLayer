import Link from "next/link";
import { FirstRunChecklist } from "../../components/first-run-checklist";
import { Badge, ButtonLink, EmptyState, OutcomeBadge } from "../../components/ui/primitives";
import { summarizeDecisionHealth } from "../../lib/decision-health";
import { buildFirstRunGuide } from "../../lib/first-run";
import { loadDashboardDecisionFeed } from "../../lib/server/dashboard-decisions";
import { getIntegrationReadiness } from "../../lib/server/integration-health";
import { getOptionalPolicyStore } from "../../lib/server/policy-store";
import { getAuthenticatedWorkspace } from "../../lib/server/workspace";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const feed = await loadDashboardDecisionFeed(100);
  const health = summarizeDecisionHealth(feed.decisions);
  const recentDecisions = feed.decisions.slice(0, 8);
  const reviewDecision = feed.decisions.find((decision) => decision.outcome === "REVIEW");
  const guide = await loadFirstRunGuide(feed.mode === "live" ? feed.decisions.length : 0);

  return (
    <>
      <header className="dashboardHeader">
        <div>
          <div className="headerModeRow">
            <p className="vlEyebrow">Control center</p>
            <Badge tone={feed.mode === "live" ? "success" : "neutral"}>
              {feed.mode === "live" ? "Live receipts" : "No data yet"}
            </Badge>
          </div>
          <h1 className="dashboardTitle">Every action has to earn execution.</h1>
          <p className="dashboardIntro">See what autonomous agents attempted, which policies create friction, where SERV reasoned over context, and whether evidence quality is improving.</p>
        </div>
        <Badge tone="accent"><span className="pulse" /> Decision health</Badge>
      </header>

      <FirstRunChecklist guide={guide} />

      {feed.mode === "empty" ? (
        <EmptyState
          eyebrow="No receipts yet"
          title="Your operational picture starts with the first evaluated action."
          copy="Create a policy, connect an execution path, and evaluate an action to generate your first Decision Receipt."
          action={
            <div className="vlCluster">
              <ButtonLink tone="primary" href="/dashboard/policies">Create a policy →</ButtonLink>
              <ButtonLink tone="secondary" href="/dashboard/integrations">Connect an integration →</ButtonLink>
              <ButtonLink tone="ghost" href="/dashboard/developers">Open Developer Console →</ButtonLink>
            </div>
          }
        />
      ) : (
        <>
          <section className="metricGrid" aria-label="Decision summary">
            <Link href="/dashboard/decisions?outcome=ALLOW" className="metricCard metricLink vlCard vlCardInteractive"><span>Allowed</span><strong>{health.outcomes.ALLOW}</strong><small>safe to execute</small></Link>
            <Link href="/dashboard/decisions?outcome=REVIEW" className="metricCard metricLink vlCard vlCardInteractive"><span>Needs review</span><strong>{health.outcomes.REVIEW}</strong><small>{health.unresolvedReviews} unresolved latest action{health.unresolvedReviews === 1 ? "" : "s"}</small></Link>
            <Link href="/dashboard/decisions?outcome=BLOCK" className="metricCard metricLink vlCard vlCardInteractive"><span>Blocked</span><strong>{health.outcomes.BLOCK}</strong><small>stopped before execution</small></Link>
            <Link href="/dashboard/decisions?reasoning=serv" className="metricCard accentMetric metricLink vlCard vlCardInteractive"><span>SERV-assisted</span><strong>{health.servAssisted}</strong><small>{health.deterministicOnly} deterministic-only</small></Link>
          </section>

          <section className="healthGrid dashboardSection" aria-label="Decision health">
            <article className="healthPanel vlCard">
              <div className="healthPanelTop"><div><p className="vlEyebrow">Evidence health</p><h2>{health.evidenceCompleteness}%</h2></div><span className={health.evidenceTrendDelta >= 0 ? "trendUp" : "trendDown"}>{health.evidenceTrendDelta >= 0 ? "+" : ""}{health.evidenceTrendDelta} pts</span></div>
              <p>Average evidence completeness across the newest half of recent actions versus the previous half.</p>
              <Link href="/dashboard/decisions" className="rowLink">Inspect evidence trails →</Link>
            </article>

            <article className="healthPanel vlCard">
              <div className="sectionHeading compactSectionHeading"><div><p className="vlEyebrow">Actions by tool</p><h3>Where agents are acting</h3></div></div>
              <div className="healthList">
                {health.tools.slice(0, 5).map((tool) => (
                  <Link href={`/dashboard/decisions?tool=${encodeURIComponent(tool.tool)}`} key={tool.tool} className="healthListRow">
                    <span><strong>{tool.tool}</strong><small>{tool.friction} REVIEW/BLOCK</small></span><b>{tool.total}</b>
                  </Link>
                ))}
              </div>
            </article>

            <article className="healthPanel vlCard">
              <div className="sectionHeading compactSectionHeading"><div><p className="vlEyebrow">Policy friction</p><h3>What stops execution</h3></div></div>
              <div className="healthList">
                {health.topPolicies.length ? health.topPolicies.map((policy) => (
                  <Link href={`/dashboard/policies?focus=${encodeURIComponent(policy.policyId)}`} key={policy.policyId} className="healthListRow">
                    <span><strong>{policy.policyId}</strong><small>{policy.outcomes.join(" + ")}</small></span><b>{policy.count}</b>
                  </Link>
                )) : <p className="healthEmpty">No REVIEW/BLOCK policy friction in this window.</p>}
              </div>
            </article>
          </section>

          <section className="dashboardSection" id="decisions">
            <div className="sectionHeading">
              <div><p className="vlEyebrow">Decision stream</p><h2>Recent agent actions</h2></div>
              <span className="sectionMeta">Source: {feed.persistence} Decision Receipts</span>
            </div>
            <div className="decisionTable vlCard" role="table" aria-label="Recent VetoLayer decisions">
              <div className="decisionTableHead" role="row">
                <span>Action</span><span>Outcome</span><span>Reasoning</span><span>Time</span><span />
              </div>
              {recentDecisions.map((decision) => (
                <div className="decisionTableRow" role="row" key={decision.receiptId}>
                  <div><strong>{decision.display.title}</strong><small>{decision.display.repository}</small></div>
                  <OutcomeBadge outcome={decision.outcome} />
                  <div className="reasoningMode">
                    <span>{decision.contextualFindings.length || decision.providerTrace ? "Deterministic + SERV" : "Deterministic"}</span>
                    <small>{decision.contextualFindings.length ? `${decision.contextualFindings.length} contextual finding${decision.contextualFindings.length === 1 ? "" : "s"}` : "SERV skipped"}</small>
                  </div>
                  <span className="rowTime">{decision.display.relativeTime}</span>
                  <Link className="rowLink" href={`/dashboard/decisions/${decision.receiptId}`}>Inspect →</Link>
                </div>
              ))}
            </div>
          </section>

          <section className="reviewSpotlight dashboardSection" id="reviews">
            <div>
              <p className="vlEyebrow">Human review</p>
              <h2>{health.unresolvedReviews ? `${health.unresolvedReviews} latest action${health.unresolvedReviews === 1 ? " is" : "s are"} waiting on judgment.` : "No latest actions are waiting on human judgment."}</h2>
              <p className="muted">REVIEW is an operational state, not a model failure. VetoLayer preserves what is unresolved so people can change the evidence and re-run the same gate.</p>
              <Link className="rowLink" href="/dashboard/reviews">Open Review Inbox →</Link>
            </div>
            {reviewDecision ? (
              <article className="reviewCard vlCard vlCardRaised">
                <div className="reviewCardTop"><OutcomeBadge outcome="REVIEW" /><span>{reviewDecision.display.relativeTime}</span></div>
                <h3>{reviewDecision.display.title}</h3>
                <p>{reviewDecision.decisionSummary}</p>
                <div className="requirementBox"><span>Required next</span><strong>{reviewDecision.requirementsToChangeOutcome[0] ?? "A human must resolve the outstanding policy condition."}</strong></div>
                <Link className="primaryLink" href={`/dashboard/decisions/${reviewDecision.receiptId}`}>Open review context →</Link>
              </article>
            ) : null}
          </section>
        </>
      )}
    </>
  );
}

async function loadFirstRunGuide(decisionCount: number) {
  let policyCount = 0;
  try {
    const workspace = await getAuthenticatedWorkspace();
    const policyStore = getOptionalPolicyStore();
    if (workspace && policyStore) {
      policyCount = (await policyStore.list(workspace.workspaceId)).length;
    }
  } catch {
    policyCount = 0;
  }

  let integrationReady = false;
  try {
    const readiness = getIntegrationReadiness();
    integrationReady = readiness.github.ready || readiness.developerApi.ready;
  } catch {
    integrationReady = false;
  }

  return buildFirstRunGuide({ policyCount, integrationReady, decisionCount });
}

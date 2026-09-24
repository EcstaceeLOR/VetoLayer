import Link from "next/link";
import { dashboardDecisions } from "../../lib/dashboard-data";

const counts = dashboardDecisions.reduce(
  (acc, decision) => ({ ...acc, [decision.outcome]: acc[decision.outcome] + 1 }),
  { ALLOW: 0, REVIEW: 0, BLOCK: 0 },
);

export default function DashboardPage() {
  const reviewDecision = dashboardDecisions.find((decision) => decision.outcome === "REVIEW");

  return (
    <>
      <header className="dashboardHeader">
        <div>
          <p className="eyebrow">CONTROL CENTER</p>
          <h1 className="dashboardTitle">Every action has to earn execution.</h1>
          <p className="dashboardIntro">See what autonomous agents attempted, which policies mattered, where SERV reasoned over context, and why VetoLayer allowed, escalated, or blocked the action.</p>
        </div>
        <div className="liveBadge"><span className="pulse" /> Live policy gate</div>
      </header>

      <section className="metricGrid" aria-label="Decision summary">
        <article className="metricCard"><span>Allowed</span><strong>{counts.ALLOW}</strong><small>safe to execute</small></article>
        <article className="metricCard"><span>Needs review</span><strong>{counts.REVIEW}</strong><small>human judgment required</small></article>
        <article className="metricCard"><span>Blocked</span><strong>{counts.BLOCK}</strong><small>stopped before execution</small></article>
        <article className="metricCard accentMetric"><span>SERV-assisted</span><strong>2</strong><small>contextual decisions</small></article>
      </section>

      <section className="dashboardSection" id="decisions">
        <div className="sectionHeading">
          <div><p className="eyebrow">DECISION STREAM</p><h2>Recent agent actions</h2></div>
          <span className="sectionMeta">Source: core Decision Receipt contract</span>
        </div>
        <div className="decisionTable" role="table" aria-label="Recent VetoLayer decisions">
          <div className="decisionTableHead" role="row">
            <span>Action</span><span>Outcome</span><span>Reasoning</span><span>Time</span><span />
          </div>
          {dashboardDecisions.map((decision) => (
            <div className="decisionTableRow" role="row" key={decision.decisionId}>
              <div><strong>{decision.display.title}</strong><small>{decision.display.repository}</small></div>
              <span className={`outcomeBadge ${decision.outcome.toLowerCase()}`}>{decision.outcome}</span>
              <div className="reasoningMode">
                <span>{decision.contextualFindings.length ? "Deterministic + SERV" : "Deterministic"}</span>
                <small>{decision.contextualFindings.length ? `${decision.contextualFindings.length} contextual finding` : "SERV skipped"}</small>
              </div>
              <span className="rowTime">{decision.display.relativeTime}</span>
              <Link className="rowLink" href={`/dashboard/decisions/${decision.decisionId}`}>Inspect →</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="reviewSpotlight dashboardSection" id="reviews">
        <div>
          <p className="eyebrow">HUMAN REVIEW</p>
          <h2>One action is waiting on a person, not another model call.</h2>
          <p className="muted">REVIEW is a deliberate operating state. VetoLayer explains what is unresolved so a human can inspect the evidence and decide what changes next.</p>
        </div>
        {reviewDecision ? (
          <article className="reviewCard">
            <div className="reviewCardTop"><span className="outcomeBadge review">REVIEW</span><span>{reviewDecision.display.relativeTime}</span></div>
            <h3>{reviewDecision.display.title}</h3>
            <p>{reviewDecision.decisionSummary}</p>
            <div className="requirementBox"><span>Required next</span><strong>{reviewDecision.requirementsToChangeOutcome[0]}</strong></div>
            <Link className="primaryLink" href={`/dashboard/decisions/${reviewDecision.decisionId}`}>Open review context →</Link>
          </article>
        ) : null}
      </section>
    </>
  );
}

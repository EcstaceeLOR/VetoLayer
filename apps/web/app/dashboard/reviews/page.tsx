import Link from "next/link";
import { dashboardDecisions } from "../../../lib/dashboard-data";

export default function ReviewsPage() {
  const pending = dashboardDecisions.filter((decision) => decision.outcome === "REVIEW");

  return (
    <>
      <header className="dashboardHeader compactHeader"><div><p className="eyebrow">HUMAN REVIEW</p><h1 className="dashboardTitle">Escalation is a feature, not a failure.</h1><p className="dashboardIntro">These actions could not safely earn ALLOW or BLOCK automatically. A reviewer should see the unresolved evidence and contextual reasoning before acting.</p></div><span className="queueCount">{pending.length} pending</span></header>
      <section className="dashboardSection">
        <div className="reviewQueue">
          {pending.length ? pending.map((decision) => (
            <article className="reviewQueueCard" key={decision.decisionId}>
              <div className="reviewQueueTop"><span className="outcomeBadge review">REVIEW</span><span>{decision.display.relativeTime}</span></div>
              <h3>{decision.display.title}</h3><p>{decision.decisionSummary}</p>
              <div className="requirementBox"><span>UNRESOLVED</span><strong>{decision.requirementsToChangeOutcome[0] ?? "Additional human judgment is required."}</strong></div>
              <Link className="primaryLink" href={`/dashboard/decisions/${decision.decisionId}`}>Inspect full decision →</Link>
            </article>
          )) : <div className="emptyState"><span>✓</span><h3>No actions need review.</h3><p>When VetoLayer cannot safely decide automatically, the action will appear here.</p></div>}
        </div>
      </section>
      <p className="surfaceNote">The operational approve/reject/request-evidence loop is implemented in the dedicated Human Review issue; this route establishes the stable product surface now.</p>
    </>
  );
}

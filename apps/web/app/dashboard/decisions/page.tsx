import Link from "next/link";
import { dashboardDecisions } from "../../../lib/dashboard-data";

export default function DecisionsPage() {
  return (
    <>
      <header className="dashboardHeader compactHeader"><div><p className="eyebrow">DECISIONS</p><h1 className="dashboardTitle">Every proposed action, with the reason it earned its outcome.</h1><p className="dashboardIntro">Inspect deterministic checks, SERV contextual findings, evidence, and receipt integrity from one place.</p></div></header>
      <section className="dashboardSection">
        <div className="decisionTable" role="table" aria-label="VetoLayer decisions">
          <div className="decisionTableHead" role="row"><span>Action</span><span>Outcome</span><span>Reasoning</span><span>Time</span><span /></div>
          {dashboardDecisions.map((decision) => (
            <div className="decisionTableRow" role="row" key={decision.decisionId}>
              <div><strong>{decision.display.title}</strong><small>{decision.display.repository}</small></div>
              <span className={`outcomeBadge ${decision.outcome.toLowerCase()}`}>{decision.outcome}</span>
              <div className="reasoningMode"><span>{decision.contextualFindings.length ? "Deterministic + SERV" : "Deterministic"}</span><small>{decision.contextualFindings.length ? "Contextual judgment attached" : "SERV not required"}</small></div>
              <span className="rowTime">{decision.display.relativeTime}</span>
              <Link className="rowLink" href={`/dashboard/decisions/${decision.decisionId}`}>Inspect →</Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

import Link from "next/link";
import { loadDashboardDecisionFeed } from "../../../lib/server/dashboard-decisions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DecisionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const feed = await loadDashboardDecisionFeed(200);
  const outcome = single(params.outcome)?.toUpperCase();
  const tool = single(params.tool);
  const reasoning = single(params.reasoning);

  const decisions = feed.decisions.filter((decision) => {
    if (outcome && decision.outcome !== outcome) return false;
    if (tool && decision.action.tool !== tool) return false;
    if (reasoning === "serv" && !(decision.contextualFindings.length || decision.providerTrace)) return false;
    return true;
  });

  return (
    <>
      <header className="dashboardHeader compactHeader"><div><div className="headerModeRow"><p className="eyebrow">DECISIONS</p><span className={`dataModeBadge ${feed.mode}`}>{feed.mode === "demo" ? "DEMO DATA" : feed.mode === "live" ? "LIVE RECEIPTS" : "NO DATA YET"}</span></div><h1 className="dashboardTitle">Every proposed action, with the reason it earned its outcome.</h1><p className="dashboardIntro">Inspect deterministic checks, SERV contextual findings, evidence, and receipt integrity from one place.</p></div></header>
      <section className="dashboardSection">
        <div className="decisionFilterBar">
          <span>{decisions.length} decision{decisions.length === 1 ? "" : "s"}</span>
          {(outcome || tool || reasoning) ? <Link href="/dashboard/decisions" className="rowLink">Clear filters ×</Link> : null}
        </div>
        {decisions.length ? (
          <div className="decisionTable" role="table" aria-label="VetoLayer decisions">
            <div className="decisionTableHead" role="row"><span>Action</span><span>Outcome</span><span>Reasoning</span><span>Time</span><span /></div>
            {decisions.map((decision) => (
              <div className="decisionTableRow" role="row" key={decision.receiptId}>
                <div><strong>{decision.display.title}</strong><small>{decision.display.repository}</small></div>
                <span className={`outcomeBadge ${decision.outcome.toLowerCase()}`}>{decision.outcome}</span>
                <div className="reasoningMode"><span>{decision.contextualFindings.length || decision.providerTrace ? "Deterministic + SERV" : "Deterministic"}</span><small>{decision.contextualFindings.length || decision.providerTrace ? "Contextual judgment attached" : "SERV not required"}</small></div>
                <span className="rowTime">{decision.display.relativeTime}</span>
                <Link className="rowLink" href={`/dashboard/decisions/${decision.receiptId}`}>Inspect →</Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboardEmptyState compactEmptyState"><h2>No decisions match this view.</h2><p>{feed.mode === "empty" ? "No persisted Decision Receipts exist yet." : "Change or clear the active filters to inspect another part of the decision stream."}</p></div>
        )}
      </section>
    </>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

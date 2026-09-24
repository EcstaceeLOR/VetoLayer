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

  const filtered = Boolean(outcome || tool || reasoning);

  return (
    <>
      <header className="dashboardHeader compactHeader"><div><div className="headerModeRow"><p className="eyebrow">DECISIONS</p><span className={`dataModeBadge ${feed.mode}`}>{feed.mode === "demo" ? "DEMO DATA" : feed.mode === "live" ? "LIVE RECEIPTS" : "NO DATA YET"}</span></div><h1 className="dashboardTitle">Every proposed action, with the reason it earned its outcome.</h1><p className="dashboardIntro">Inspect deterministic checks, SERV contextual findings, evidence, and receipt integrity from one place.</p></div></header>

      {feed.mode === "demo" ? (
        <section className="demoDataNotice">
          <div><span>DEMO MODE</span><strong>Seeded receipts are clearly separated from real workspace decisions.</strong><p>Use them to understand the interface, then run the flagship scenario to see the real pipeline evaluate changing evidence.</p></div>
          <Link href="/demo">Run flagship scenario →</Link>
        </section>
      ) : null}

      <section className="dashboardSection">
        <div className="decisionFilterBar">
          <span>{decisions.length} decision{decisions.length === 1 ? "" : "s"}</span>
          {filtered ? <Link href="/dashboard/decisions" className="rowLink">Clear filters ×</Link> : null}
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
        ) : filtered ? (
          <div className="dashboardEmptyState compactEmptyState">
            <p className="eyebrow">FILTERED VIEW</p>
            <h2>No decisions match these filters.</h2>
            <p>Your decision history is intact. Clear the active filters to inspect the rest of the stream.</p>
            <div className="emptyActions"><Link className="primaryLink" href="/dashboard/decisions">Clear filters →</Link></div>
          </div>
        ) : (
          <div className="dashboardEmptyState compactEmptyState">
            <p className="eyebrow">FIRST DECISION</p>
            <h2>No real Decision Receipts exist yet.</h2>
            <p>A decision appears here only after an action has actually passed through VetoLayer. Connect an execution path, evaluate one action, and this becomes your auditable history.</p>
            <div className="emptyActions">
              <Link className="primaryLink" href="/dashboard/integrations">Connect an integration →</Link>
              <Link className="rowLink" href="/dashboard/policies">Create a policy →</Link>
              <Link className="rowLink" href="/demo">Run flagship demo →</Link>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

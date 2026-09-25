import Link from "next/link";
import { SavedDecisionViews } from "../../../components/saved-decision-views";
import { decisionExplorerHref, parseDecisionExplorerQuery, type ExplorerSearchParams } from "../../../lib/decision-explorer";
import { loadDecisionExplorer } from "../../../lib/server/dashboard-decisions";
import "./decision-explorer.css";

export const dynamic = "force-dynamic";

type SearchParams = Promise<ExplorerSearchParams>;

export default async function DecisionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = parseDecisionExplorerQuery(params);
  const currentHref = decisionExplorerHref(query);

  let explorer;
  try {
    explorer = await loadDecisionExplorer(query);
  } catch {
    return <DecisionExplorerError />;
  }
  if (!explorer) return <DecisionExplorerError message="Your workspace could not be loaded. Sign in again or select an active workspace." />;

  const projectNames = new Map(explorer.projects.map((project) => [project.id, project.name]));
  const activeFilters = Boolean(query.search || query.outcome || query.projectId || query.environmentId || query.source || query.tool || query.policy || query.serv !== undefined || query.reviewState || query.from || query.to || (query.sort && query.sort !== "newest"));
  const start = explorer.page.total ? (explorer.page.page - 1) * explorer.page.pageSize + 1 : 0;
  const end = explorer.page.total ? Math.min(explorer.page.total, start + explorer.page.decisions.length - 1) : 0;

  return (
    <>
      <header className="dashboardHeader compactHeader decisionExplorerHeader">
        <div>
          <div className="headerModeRow"><p className="eyebrow">DECISION EXPLORER</p><span className={`dataModeBadge ${explorer.mode}`}>{explorer.mode === "live" ? "LIVE RECEIPTS" : "NO DATA YET"}</span></div>
          <h1 className="dashboardTitle">Investigate every decision, not just the latest ones.</h1>
          <p className="dashboardIntro">Search signed receipts across actions, actors, resources, policies, projects, environments, integrations, review state, and SERV usage. Query state is encoded in the URL so investigations survive navigation and can be saved.</p>
        </div>
      </header>

      <section className="decisionExplorerControls">
        <form method="get" className="decisionFilterGrid">
          <label className="decisionSearchField"><span>Search</span><input type="search" name="q" defaultValue={query.search ?? ""} placeholder="Decision, receipt, actor, action, resource, policy…" /></label>
          <label><span>Outcome</span><select name="outcome" defaultValue={query.outcome ?? ""}><option value="">All outcomes</option><option value="ALLOW">ALLOW</option><option value="REVIEW">REVIEW</option><option value="BLOCK">BLOCK</option></select></label>
          <label><span>Project</span><select name="project" defaultValue={query.projectId ?? ""}><option value="">All projects</option>{explorer.projects.map((project) => <option value={project.id} key={project.id}>{project.name}{project.status === "archived" ? " · archived" : ""}</option>)}</select></label>
          <label><span>Environment</span><select name="environment" defaultValue={query.environmentId ?? ""}><option value="">All environments</option>{explorer.environments.filter((environment) => !query.projectId || environment.projectId === query.projectId).map((environment) => <option value={environment.id} key={environment.id}>{projectNames.get(environment.projectId) ?? "Project"} · {environment.name}{environment.status === "archived" ? " · archived" : ""}</option>)}</select></label>
          <label><span>Source</span><select name="source" defaultValue={query.source ?? ""}><option value="">All sources</option><option value="integration">Connected integrations</option><option value="api">Developer API</option></select></label>
          <label><span>Integration / tool</span><input name="tool" defaultValue={query.tool ?? ""} placeholder="github, slack, custom…" /></label>
          <label><span>SERV</span><select name="serv" defaultValue={query.serv === true ? "yes" : query.serv === false ? "no" : ""}><option value="">Any reasoning path</option><option value="yes">SERV used</option><option value="no">Deterministic only</option></select></label>
          <label><span>Review state</span><select name="review" defaultValue={query.reviewState ?? ""}><option value="">Any review state</option><option value="pending">Pending</option><option value="awaiting_evidence">Awaiting evidence</option><option value="resolved">Resolved</option><option value="none">No review workflow</option></select></label>
          <label><span>Policy</span><input name="policy" defaultValue={query.policy ?? ""} placeholder="Logical policy ID" /></label>
          <label><span>From</span><input type="date" name="from" defaultValue={query.from?.slice(0, 10) ?? ""} /></label>
          <label><span>To</span><input type="date" name="to" defaultValue={query.to?.slice(0, 10) ?? ""} /></label>
          <label><span>Sort</span><select name="sort" defaultValue={query.sort ?? "newest"}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="outcome">Outcome</option><option value="action">Action</option></select></label>
          <label><span>Rows</span><select name="pageSize" defaultValue={String(query.pageSize ?? 25)}><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
          <div className="decisionFilterActions"><button type="submit" className="primaryButton buttonReset">Apply investigation</button>{activeFilters ? <Link href="/dashboard/decisions" className="secondaryButton">Clear all</Link> : null}</div>
        </form>
        <SavedDecisionViews workspaceId={explorer.workspaceId} currentHref={currentHref} />
      </section>

      <section className="dashboardSection decisionResultsSection">
        <div className="decisionResultSummary">
          <div><span className="vlEyebrow">RESULTS</span><strong>{explorer.page.total.toLocaleString()} receipt{explorer.page.total === 1 ? "" : "s"}</strong><small>{explorer.page.total ? `Showing ${start.toLocaleString()}–${end.toLocaleString()} · page ${explorer.page.page} of ${explorer.page.totalPages}` : "No silent truncation — pagination is driven by the full query count."}</small></div>
          <span className={`persistenceBadge ${explorer.persistence}`}>{explorer.persistence === "supabase" ? "Durable history" : "Development memory"}</span>
        </div>

        {explorer.decisions.length ? (
          <div className="decisionExplorerTable" role="table" aria-label="VetoLayer Decision Explorer results">
            <div className="decisionExplorerHead" role="row"><span>Action / resource</span><span>Outcome</span><span>Scope</span><span>Reasoning</span><span>Review</span><span>Time</span><span /></div>
            {explorer.decisions.map(({ record, decision, projectName, environmentName }) => {
              const returnParam = new URLSearchParams({ returnTo: currentHref }).toString();
              return (
                <div className="decisionExplorerRow" role="row" key={record.id}>
                  <div className="decisionIdentity"><strong>{decision.display.title}</strong><small className="mono">{decision.receiptId}</small><small>{decision.actor.name ?? decision.actor.id} · {record.source === "api" ? "Developer API" : `${decision.action.tool} integration`}</small></div>
                  <span className={`outcomeBadge ${decision.outcome.toLowerCase()}`}>{decision.outcome}</span>
                  <div><strong>{projectName ?? record.projectId ?? "Legacy"}</strong><small>{environmentName ?? record.environmentId ?? "Unscoped"}</small></div>
                  <div className="reasoningMode"><span>{decision.contextualFindings.length || decision.providerTrace ? "Deterministic + SERV" : "Deterministic"}</span><small>{decision.policiesEvaluated.length} policy version{decision.policiesEvaluated.length === 1 ? "" : "s"}</small></div>
                  <span className={`reviewStateBadge ${record.reviewState ?? "none"}`}>{(record.reviewState ?? "none").replace("_", " ")}</span>
                  <div><span className="rowTime">{formatDate(record.createdAt)}</span><small>{decision.display.relativeTime}</small></div>
                  <Link className="rowLink" href={`/dashboard/decisions/${encodeURIComponent(decision.receiptId)}?${returnParam}`}>Inspect →</Link>
                </div>
              );
            })}
          </div>
        ) : activeFilters ? (
          <div className="dashboardEmptyState compactEmptyState"><p className="eyebrow">NO MATCHES</p><h2>No receipt matches this investigation.</h2><p>Try broadening the date range or clearing one or more filters. The underlying history has not been truncated.</p><div className="emptyActions"><Link className="primaryLink" href="/dashboard/decisions">Clear investigation →</Link></div></div>
        ) : (
          <div className="dashboardEmptyState compactEmptyState"><p className="eyebrow">FIRST RECEIPT</p><h2>No Decision Receipts exist in this workspace yet.</h2><p>Connect an execution path or call the Developer API. Each evaluated action will appear here as a durable, searchable receipt.</p><div className="emptyActions"><Link className="primaryLink" href="/dashboard/integrations">Connect an integration →</Link><Link className="rowLink" href="/dashboard/developers">Open Developer Console →</Link></div></div>
        )}

        {explorer.page.totalPages > 1 ? (
          <nav className="decisionPagination" aria-label="Decision results pagination">
            {explorer.page.hasPrevious ? <Link href={decisionExplorerHref(query, { page: explorer.page.page - 1 })}>← Previous</Link> : <span />}
            <div>{paginationWindow(explorer.page.page, explorer.page.totalPages).map((page, index) => page === "…" ? <span key={`gap-${index}`}>…</span> : <Link className={page === explorer.page.page ? "active" : ""} key={page} href={decisionExplorerHref(query, { page })}>{page}</Link>)}</div>
            {explorer.page.hasNext ? <Link href={decisionExplorerHref(query, { page: explorer.page.page + 1 })}>Next →</Link> : <span />}
          </nav>
        ) : null}
      </section>
    </>
  );
}

function DecisionExplorerError({ message = "Decision history is temporarily unavailable." }: { message?: string }) {
  return <div className="dashboardEmptyState compactEmptyState decisionExplorerError"><p className="eyebrow">DECISION EXPLORER</p><h2>We couldn’t load the receipt index.</h2><p>{message}</p><div className="emptyActions"><Link className="primaryLink" href="/dashboard/decisions">Retry →</Link></div></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
}

function paginationWindow(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const values = new Set<number>([1, total, current - 1, current, current + 1].filter((value) => value >= 1 && value <= total));
  const sorted = [...values].sort((a, b) => a - b);
  const result: Array<number | "…"> = [];
  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];
    if (previous && value - previous > 1) result.push("…");
    result.push(value);
  });
  return result;
}

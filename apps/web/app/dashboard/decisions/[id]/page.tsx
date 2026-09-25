import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptActions } from "../../../../components/receipt-actions";
import { compareDecisionReceipts } from "../../../../lib/decision-explorer";
import { parsePolicyVersionReference } from "../../../../lib/policy-lifecycle";
import { loadDecisionReceiptCenter } from "../../../../lib/server/dashboard-decisions";
import "../decision-explorer.css";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DecisionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const center = await loadDecisionReceiptCenter(id);
  if (!center) notFound();

  const decision = center.decision;
  const allFindings = [...decision.deterministicFindings, ...decision.contextualFindings];
  const policyById = new Map(decision.policiesEvaluated.map((policy) => [policy.id, policy]));
  const returnTo = safeReturnPath(single(query.returnTo));
  const compareId = single(query.compare);
  const compareRecord = compareId ? center.lineage.find((item) => item.receipt.receiptId === compareId) : undefined;
  const comparison = compareRecord && compareRecord.receipt.receiptId !== decision.receiptId
    ? compareDecisionReceipts(compareRecord.receipt, decision)
    : [];

  return (
    <>
      <header className="detailHeader receiptCenterHeader">
        <div>
          <Link className="backLink" href={returnTo}>← Decision Explorer</Link>
          <p className="eyebrow">RECEIPT CENTER</p>
          <h1 className="detailTitle">{decision.display.title}</h1>
          <p className="dashboardIntro">{decision.decisionSummary}</p>
        </div>
        <span className={`heroOutcome ${decision.outcome.toLowerCase()}`}>{decision.outcome}</span>
      </header>

      <ReceiptActions receiptId={decision.receiptId} receiptJson={JSON.stringify(center.record.receipt, null, 2)} initialVerified={center.integrityVerified} />

      <section className="detailMetaGrid receiptMetaGrid">
        <article><span>Receipt</span><strong className="mono">{decision.receiptId}</strong><small>{decision.schemaVersion}</small></article>
        <article><span>Decision</span><strong className="mono">{decision.decisionId}</strong><small>{decision.action.requestId}</small></article>
        <article><span>Actor</span><strong>{decision.actor.name ?? decision.actor.id}</strong><small>{decision.actor.framework ?? decision.actor.kind}</small></article>
        <article><span>Scope</span><strong>{center.projectName ?? decision.scope?.projectName ?? center.record.projectId ?? "Legacy"}</strong><small>{center.environmentName ?? decision.scope?.environmentName ?? center.record.environmentId ?? "Unscoped"}</small></article>
        <article><span>Integrity</span><strong>{center.integrityVerified ? "Verified" : "Mismatch"}</strong><small className="mono hashText">{decision.integrity.hash.slice(0, 18)}…</small></article>
      </section>

      <section className="receiptSection">
        <div className="receiptSectionHeader"><div><p className="eyebrow">SIGNED RECEIPT</p><h2>Decision context</h2><p>The values below are part of the immutable receipt content.</p></div></div>
        <div className="receiptSummaryGrid">
          <article className="receiptInfoCard"><span>Action</span><strong>{decision.action.tool}.{decision.action.operation}</strong><p>{decision.action.type} · {decision.action.targetType}</p></article>
          <article className="receiptInfoCard"><span>Target</span><strong>{decision.action.targetId ?? decision.action.targetType}</strong><p>{decision.action.environment ?? "No action environment supplied"}</p></article>
          <article className="receiptInfoCard"><span>Requested / decided</span><strong>{formatDate(decision.timestamps.requestedAt)}</strong><p>Decided {formatDate(decision.timestamps.decidedAt)}</p></article>
          <article className="receiptInfoCard"><span>Source</span><strong>{sourceLabel(center.record.source, decision.action.tool)}</strong><p>{center.record.reviewCaseId ? `Review ${center.record.reviewState ?? "none"}` : "No linked operational review"}</p></article>
          <article className="receiptInfoCard"><span>Schema</span><strong>Receipt {decision.versions.receiptSchema}</strong><p>Orchestrator {decision.versions.orchestrator}</p></article>
          <article className="receiptInfoCard"><span>Lineage</span><strong>{center.lineage.length} receipt{center.lineage.length === 1 ? "" : "s"}</strong><p className="mono">{decision.action.requestId}</p></article>
        </div>
      </section>

      <section className="receiptSection">
        <div className="receiptSectionHeader"><div><p className="eyebrow">DECISION LINEAGE</p><h2>Every re-evaluation of this action</h2><p>Receipts are appended, never overwritten. Compare any prior receipt with the one you are viewing.</p></div></div>
        <div className="lineageRail">
          {center.lineage.map((item, index) => {
            const current = item.receipt.receiptId === decision.receiptId;
            const detailParams = new URLSearchParams({ returnTo });
            const compareParams = new URLSearchParams({ returnTo, compare: item.receipt.receiptId });
            return (
              <div className={`lineageNode ${current ? "current" : ""}`} key={item.receipt.receiptId}>
                <span className="lineageIndex">{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{item.receipt.outcome} · {item.receipt.receiptId}</strong><small>{formatDate(item.createdAt)}{item.parentReceiptId ? ` · parent ${item.parentReceiptId}` : " · lineage root"}</small></div>
                <div className="lineageActions">{!current ? <><Link href={`/dashboard/decisions/${encodeURIComponent(item.receipt.receiptId)}?${detailParams}`}>Open</Link><Link href={`/dashboard/decisions/${encodeURIComponent(decision.receiptId)}?${compareParams}`}>Compare</Link></> : <span className="reviewStateBadge resolved">Viewing</span>}</div>
              </div>
            );
          })}
        </div>
      </section>

      {comparison.length && compareRecord ? (
        <section className="receiptSection" id="comparison">
          <div className="receiptSectionHeader"><div><p className="eyebrow">RECEIPT COMPARISON</p><h2>What changed after re-evaluation</h2><p><span className="mono">{compareRecord.receipt.receiptId}</span> → <span className="mono">{decision.receiptId}</span></p></div><Link className="rowLink" href={`/dashboard/decisions/${encodeURIComponent(decision.receiptId)}?${new URLSearchParams({ returnTo })}`}>Close comparison ×</Link></div>
          <div className="receiptComparison">
            <div className="receiptComparisonRow"><strong>Field</strong><strong>Earlier receipt</strong><strong>Current receipt</strong></div>
            {comparison.map((row) => <div className={`receiptComparisonRow ${row.changed ? "changed" : ""}`} key={row.field}><strong>{row.field}</strong><span>{row.before}</span><span>{row.after}</span></div>)}
          </div>
        </section>
      ) : null}

      <section className="receiptSection">
        <div className="receiptSectionHeader"><div><p className="eyebrow">GOVERNING POLICIES</p><h2>Exact policy versions evaluated</h2><p>Version references live inside the signed receipt, preserving historical meaning after later edits.</p></div></div>
        {decision.policiesEvaluated.length ? <div className="receiptPolicies">{decision.policiesEvaluated.map((policy) => {
          const reference = parsePolicyVersionReference(policy.id);
          const href = reference ? `/dashboard/policies?focus=${encodeURIComponent(reference.policyId)}&version=${reference.version}` : `/dashboard/policies?focus=${encodeURIComponent(policy.id)}`;
          return <div className="receiptPolicyRow" key={policy.id}><div><strong><Link href={href}>{policy.name}</Link></strong><small className="mono">{policy.id}</small></div><span className="modeTag">{policy.mode}</span><span className="severityTag">{policy.severity}</span><small>Priority {policy.priority} · {policy.exceptions.length} exception{policy.exceptions.length === 1 ? "" : "s"}</small></div>;
        })}</div> : <div className="dashboardEmptyState compactEmptyState"><p>No policy was recorded as applied to this receipt.</p></div>}
      </section>

      <div className="detailColumns">
        <section className="receiptSection detailPanel">
          <div className="receiptSectionHeader"><div><p className="eyebrow">POLICY FINDINGS</p><h2>Why VetoLayer decided this</h2></div></div>
          <div className="findingList">
            {allFindings.length ? allFindings.map((finding) => {
              const reference = parsePolicyVersionReference(finding.policyId);
              const receiptPolicy = policyById.get(finding.policyId);
              const label = receiptPolicy?.name ?? reference?.policyId ?? finding.policyId;
              const href = reference ? `/dashboard/policies?focus=${encodeURIComponent(reference.policyId)}&version=${reference.version}` : `/dashboard/policies?focus=${encodeURIComponent(finding.policyId)}`;
              return <article className="finding" key={finding.id}><div className="findingTop"><span className={`findingStatus ${finding.status}`}>{finding.status.toUpperCase()}</span><span className="modeTag">{finding.source === "contextual" ? "SERV reasoning" : "Deterministic"}</span>{reference ? <span className="modeTag">v{reference.version}</span> : null}</div><h3><Link href={href}>{label}</Link></h3><p>{finding.summary}</p><small>{finding.severity} severity · evidence {finding.evidenceIds.join(", ") || "none"}</small></article>;
            }) : <p className="muted">No findings were emitted.</p>}
          </div>
        </section>

        <aside className="receiptRail">
          <section className="railCard"><p className="eyebrow">EXECUTION TRACE</p><ol className="traceList">{decision.trace.map((step, index) => <li key={`${step.step}-${index}`}><span className="traceIndex">{String(index + 1).padStart(2, "0")}</span><div><strong>{step.step.replaceAll("-", " ")}</strong><p>{step.summary}</p><small>{step.status}{step.policyIds?.length ? ` · ${step.policyIds.join(", ")}` : ""}</small></div></li>)}</ol></section>
          <section className="railCard"><p className="eyebrow">RESOLUTION REQUIREMENTS</p>{decision.requirementsToChangeOutcome.length ? decision.requirementsToChangeOutcome.map((requirement) => <p className="muted" key={requirement}>{requirement}</p>) : <p className="muted">No additional requirement was recorded.</p>}</section>
          {decision.exceptionPath.length ? <section className="railCard"><p className="eyebrow">EXCEPTION PATH</p>{decision.exceptionPath.map((exception) => <div className="keyValue" key={`${exception.policyId}-${exception.exceptionId}`}><span>{exception.policyName}</span><strong>{exception.description}</strong></div>)}</section> : null}
        </aside>
      </div>

      <section className="receiptSection">
        <div className="receiptSectionHeader"><div><p className="eyebrow">EVIDENCE</p><h2>Evidence preserved in the receipt</h2><p>Verification state, provenance, references, and embedded data are shown exactly as recorded at decision time.</p></div></div>
        {decision.evidenceUsed.length ? <div className="receiptEvidenceList">{decision.evidenceUsed.map((evidence) => <article className="receiptEvidenceCard" key={evidence.id}><div className="receiptEvidenceTop"><strong>{evidence.type}</strong><span>{evidence.verification.status}</span></div><p className="mono">{evidence.id}</p><dl><dt>Source</dt><dd>{evidence.source.label ?? evidence.source.kind}</dd><dt>Reference</dt><dd>{evidence.reference ?? "Embedded evidence"}</dd><dt>Data</dt><dd className="mono">{evidence.data !== undefined ? safeJson(evidence.data) : "Not embedded"}</dd><dt>Observed</dt><dd>{formatDate(evidence.observedAt)}</dd><dt>Verifier</dt><dd>{evidence.verification.verifier ?? "Not recorded"}</dd><dt>Details</dt><dd>{evidence.verification.details ?? "No verification detail"}</dd></dl></article>)}</div> : <div className="dashboardEmptyState compactEmptyState"><p>No evidence objects were embedded in this signed receipt. Finding evidence IDs are still preserved above.</p></div>}
        {(decision.missingEvidence.length || decision.contradictoryEvidence.length) ? <div className="receiptSummaryGrid receiptFollowupGrid"><article className="receiptInfoCard"><span>Missing evidence</span><strong>{decision.missingEvidence.length}</strong>{decision.missingEvidence.map((item) => <p key={`${item.key}-${item.description}`}>{item.description}</p>)}</article><article className="receiptInfoCard"><span>Contradictions</span><strong>{decision.contradictoryEvidence.length}</strong>{decision.contradictoryEvidence.map((item) => <p key={`${item.description}-${item.evidenceIds.join("-")}`}>{item.description} · {item.evidenceIds.join(", ")}</p>)}</article></div> : null}
      </section>

      {center.reviewCase ? (
        <section className="receiptSection">
          <div className="receiptSectionHeader"><div><p className="eyebrow">HUMAN REVIEW</p><h2>Operational review history</h2><p>Status {center.reviewCase.status.replace("_", " ")} · revision {center.reviewCase.revision}{center.reviewCase.assignment ? ` · assigned to ${center.reviewCase.assignment.displayName ?? center.reviewCase.assignment.email ?? center.reviewCase.assignment.userId}` : " · unassigned"}</p></div><Link className="rowLink" href={`/dashboard/reviews?focus=${encodeURIComponent(center.reviewCase.id)}`}>Open review workspace →</Link></div>
          <div className="receiptReviewTimeline">{center.reviewCase.timeline.map((event) => <div className="receiptReviewEvent" key={event.id}><time>{formatDate(event.createdAt)}</time><div><strong>{event.type.replace("_", " ").toUpperCase()} · {event.actor?.name ?? event.actor?.id ?? "System"}</strong><p>{event.summary}</p>{event.receiptId ? <Link className="rowLink" href={`/dashboard/decisions/${encodeURIComponent(event.receiptId)}?${new URLSearchParams({ returnTo })}`}>Receipt {event.receiptId} →</Link> : null}</div></div>)}</div>
          {center.reviewCase.reviewHistory.length ? <div className="receiptSummaryGrid receiptFollowupGrid">{center.reviewCase.reviewHistory.map((review) => <article className="receiptInfoCard" key={review.id}><span>{review.action.replace("_", " ")}</span><strong>{review.reviewer.name ?? review.reviewer.id}</strong><p>{review.rationale}</p>{review.requestedEvidence.length ? <small>Requested: {review.requestedEvidence.join(", ")}</small> : null}</article>)}</div> : null}
        </section>
      ) : null}

      <section className="receiptSection">
        <div className="receiptSectionHeader"><div><p className="eyebrow">PROVIDER METADATA</p><h2>SERV / contextual provider trace</h2><p>Potential credential-shaped fields are redacted in the UI even if a provider accidentally supplied one.</p></div></div>
        {decision.providerTrace ? <dl className="providerMetadata">{Object.entries(decision.providerTrace).map(([key, value]) => <Fragment key={key}><dt>{key}</dt><dd className="mono">{displayProviderValue(key, value)}</dd></Fragment>)}</dl> : <div className="dashboardEmptyState compactEmptyState"><p>SERV was not called for this receipt.</p></div>}
      </section>
    </>
  );
}

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function safeReturnPath(value: string | undefined) { return value?.startsWith("/dashboard/decisions") ? value : "/dashboard/decisions"; }
function sourceLabel(source: string, tool: string) { return source === "api" ? "Developer API" : source === "integration" ? `${tool} integration` : "Integration"; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(date) + " UTC"; }
function safeJson(value: unknown) { try { return JSON.stringify(value); } catch { return "[unserializable data]"; } }
function displayProviderValue(key: string, value: unknown) {
  if (/(authorization|api[_-]?key|access[_-]?token|private[_-]?key|client[_-]?secret|password)/i.test(key)) return "[redacted]";
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return safeJson(value);
}

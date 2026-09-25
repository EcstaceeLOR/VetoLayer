import Link from "next/link";
import { notFound } from "next/navigation";
import { parsePolicyVersionReference } from "../../../../lib/policy-lifecycle";
import { loadDashboardDecision } from "../../../../lib/server/dashboard-decisions";

export const dynamic = "force-dynamic";

export default async function DecisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decision = await loadDashboardDecision(id);
  if (!decision) notFound();

  const allFindings = [...decision.deterministicFindings, ...decision.contextualFindings];
  const policyById = new Map(decision.policiesEvaluated.map((policy) => [policy.id, policy]));

  return (
    <>
      <header className="detailHeader">
        <div>
          <Link className="backLink" href="/dashboard/decisions">← Decision stream</Link>
          <p className="eyebrow">DECISION RECEIPT</p>
          <h1 className="detailTitle">{decision.display.title}</h1>
          <p className="dashboardIntro">{decision.decisionSummary}</p>
        </div>
        <span className={`heroOutcome ${decision.outcome.toLowerCase()}`}>{decision.outcome}</span>
      </header>

      <section className="detailMetaGrid">
        <article><span>Agent</span><strong>{decision.actor.name ?? decision.actor.id}</strong><small>{decision.actor.framework ?? decision.actor.kind}</small></article>
        <article><span>Target</span><strong>{decision.action.targetId}</strong><small>{decision.action.environment}</small></article>
        <article><span>Action</span><strong>{decision.action.operation}</strong><small>{decision.action.tool}</small></article>
        <article><span>Integrity</span><strong>SHA-256</strong><small className="mono hashText">{decision.integrity.hash.slice(0, 18)}…</small></article>
      </section>

      <div className="detailColumns">
        <section className="dashboardSection detailPanel">
          <div className="sectionHeading"><div><p className="eyebrow">POLICY FINDINGS</p><h2>Why VetoLayer decided this</h2></div></div>
          <div className="findingList">
            {allFindings.map((finding) => {
              const reference = parsePolicyVersionReference(finding.policyId);
              const receiptPolicy = policyById.get(finding.policyId);
              const label = receiptPolicy?.name ?? reference?.policyId ?? finding.policyId;
              const href = reference
                ? `/dashboard/policies?focus=${encodeURIComponent(reference.policyId)}&version=${reference.version}`
                : `/dashboard/policies?focus=${encodeURIComponent(finding.policyId)}`;
              return (
                <article className="finding" key={finding.id}>
                  <div className="findingTop">
                    <span className={`findingStatus ${finding.status}`}>{finding.status.toUpperCase()}</span>
                    <span className="modeTag">{finding.source === "contextual" ? "SERV reasoning" : "Deterministic"}</span>
                    {reference ? <span className="modeTag">v{reference.version}</span> : null}
                  </div>
                  <h3><Link href={href}>{label}</Link></h3>
                  <p>{finding.summary}</p>
                  <small>{finding.severity} severity · {finding.evidenceIds.length} evidence reference{finding.evidenceIds.length === 1 ? "" : "s"}</small>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="receiptRail">
          <section className="railCard">
            <p className="eyebrow">GOVERNING POLICY VERSIONS</p>
            {decision.policiesEvaluated.length ? decision.policiesEvaluated.map((policy) => {
              const reference = parsePolicyVersionReference(policy.id);
              const href = reference
                ? `/dashboard/policies?focus=${encodeURIComponent(reference.policyId)}&version=${reference.version}`
                : `/dashboard/policies?focus=${encodeURIComponent(policy.id)}`;
              return (
                <div className="keyValue" key={policy.id}>
                  <span>{reference ? `v${reference.version}` : "Legacy"}</span>
                  <strong><Link href={href}>{policy.name}</Link></strong>
                </div>
              );
            }) : <p className="muted">No policy was applied to this receipt.</p>}
            <small className="muted">Version references are part of the signed receipt content, so later policy edits cannot rewrite this decision&apos;s historical meaning.</small>
          </section>

          <section className="railCard">
            <p className="eyebrow">EXECUTION TRACE</p>
            <ol className="traceList">
              {decision.trace.map((step, index) => (
                <li key={`${step.step}-${index}`}>
                  <span className="traceIndex">{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{step.step.replaceAll("-", " ")}</strong><p>{step.summary}</p><small>{step.status}</small></div>
                </li>
              ))}
            </ol>
          </section>

          {decision.providerTrace ? (
            <section className="railCard servCard">
              <p className="eyebrow">SERV TRACE</p>
              <div className="keyValue"><span>Status</span><strong>{String(decision.providerTrace.providerStatus ?? "unknown")}</strong></div>
              <div className="keyValue"><span>Request</span><strong className="mono">{String(decision.providerTrace.requestId ?? "—")}</strong></div>
              <div className="keyValue"><span>Model</span><strong>{String(decision.providerTrace.model ?? "SERV")}</strong></div>
            </section>
          ) : null}
        </aside>
      </div>

      <section className="dashboardSection">
        <div className="sectionHeading"><div><p className="eyebrow">EVIDENCE & RESOLUTION</p><h2>What was considered</h2></div></div>
        <div className="evidenceGrid">
          <article className="railCard"><span className="cardLabel">Evidence referenced</span><strong>{new Set(allFindings.flatMap((finding) => finding.evidenceIds)).size}</strong><p>Evidence IDs are preserved in the finding chain and full receipt.</p></article>
          <article className="railCard"><span className="cardLabel">Missing evidence</span><strong>{decision.missingEvidence.length}</strong><p>{decision.missingEvidence[0]?.description ?? "No required evidence is missing."}</p></article>
          <article className="railCard"><span className="cardLabel">Contradictions</span><strong>{decision.contradictoryEvidence.length}</strong><p>{decision.contradictoryEvidence[0]?.description ?? "No evidence contradictions were reported."}</p></article>
        </div>
        {decision.requirementsToChangeOutcome.length ? (
          <div className="resolutionPanel"><span>What would need to change</span>{decision.requirementsToChangeOutcome.map((requirement) => <p key={requirement}>{requirement}</p>)}</div>
        ) : null}
      </section>
    </>
  );
}

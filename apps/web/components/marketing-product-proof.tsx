"use client";

import { useState } from "react";
import { Badge, OutcomeBadge } from "./ui/primitives";

type View = "decision" | "policy" | "review";

const views: Array<{ id: View; label: string }> = [
  { id: "decision", label: "Decision" },
  { id: "policy", label: "Policy" },
  { id: "review", label: "Human review" },
];

export function MarketingProductProof() {
  const [view, setView] = useState<View>("decision");

  return (
    <div className="productProofFrame vlCard vlCardRaised">
      <div className="productProofChrome">
        <div><span className="proofDot" /><span className="proofDot" /><span className="proofDot" /></div>
        <Badge tone="info">Product walkthrough · example data</Badge>
      </div>
      <div className="productProofTabs" role="tablist" aria-label="VetoLayer product walkthrough">
        {views.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={view === item.id} onClick={() => setView(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {view === "decision" ? <DecisionView /> : view === "policy" ? <PolicyView /> : <ReviewView />}
    </div>
  );
}

function DecisionView() {
  return (
    <div className="proofWorkspace">
      <aside className="proofRail">
        <span>Decision receipt</span>
        <strong>Deploy auth patch</strong>
        <small>github · production</small>
        <div className="proofReceiptMeta"><span>Receipt</span><b>rcpt_7f3…91c</b></div>
        <div className="proofReceiptMeta"><span>Integrity</span><b>SHA-256 verified</b></div>
      </aside>
      <section className="proofMain">
        <div className="proofHeadline"><div><span>Final outcome</span><h3>Execution is waiting on one condition.</h3></div><OutcomeBadge outcome="REVIEW" /></div>
        <div className="proofFinding"><i className="success">✓</i><div><strong>Required CI passed</strong><p>All three required checks are verified.</p></div><Badge tone="success">Rule</Badge></div>
        <div className="proofFinding"><i className="success">✓</i><div><strong>Emergency exception is plausible</strong><p>SERV matched the incident context to the documented exception.</p></div><Badge tone="accent">SERV</Badge></div>
        <div className="proofFinding"><i className="warning">!</i><div><strong>Security approval is unresolved</strong><p>The exception cannot complete until current human approval exists.</p></div><Badge tone="warning">Evidence</Badge></div>
      </section>
    </div>
  );
}

function PolicyView() {
  return (
    <div className="proofWorkspace policyProof">
      <aside className="proofRail">
        <span>Policy library</span>
        <strong>Production deployment</strong>
        <small>2 policies · enabled</small>
        <div className="proofMiniList"><b className="active">Sensitive change gate</b><b>Required checks</b><b>Protected window</b></div>
      </aside>
      <section className="proofMain">
        <div className="proofHeadline"><div><span>Policy composition</span><h3>Hard rules stay hard. Judgment is explicit.</h3></div><Badge tone="success">Enabled</Badge></div>
        <div className="proofPolicyRow"><span>01</span><div><Badge tone="neutral">Deterministic</Badge><strong>Required checks must pass</strong><p>Block or review on missing, stale, or failed CI evidence.</p></div></div>
        <div className="proofPolicyRow"><span>02</span><div><Badge tone="accent">SERV contextual</Badge><strong>Security-sensitive exception</strong><p>Reason only when incident evidence and exception criteria create genuine ambiguity.</p></div></div>
      </section>
    </div>
  );
}

function ReviewView() {
  return (
    <div className="proofWorkspace reviewProof">
      <aside className="proofRail">
        <span>Review inbox</span>
        <strong>1 action pending</strong>
        <small>Human judgment required</small>
        <div className="proofMiniList"><b className="active">Deploy auth patch</b><b>Refund exception</b></div>
      </aside>
      <section className="proofMain">
        <div className="proofHeadline"><div><span>Resolution path</span><h3>Humans change evidence, not verdicts.</h3></div><OutcomeBadge outcome="REVIEW" /></div>
        <ol className="proofTimeline">
          <li><span>1</span><div><strong>Initial evaluation</strong><p>Policy + SERV return REVIEW with the unresolved requirement.</p></div></li>
          <li><span>2</span><div><strong>Security lead adds approval</strong><p>The review becomes verified evidence attached to the same action lineage.</p></div></li>
          <li><span>3</span><div><strong>VetoLayer re-evaluates</strong><p>Hard policy runs again before contextual reasoning can change the outcome.</p></div></li>
        </ol>
      </section>
    </div>
  );
}

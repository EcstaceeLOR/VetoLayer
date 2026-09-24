"use client";

import type { DecisionReceipt, HumanReviewRecord } from "@vetolayer/core";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, ButtonLink, EmptyState, Field, Input, Notice, OutcomeBadge, Textarea } from "./ui/primitives";

type ReviewCaseView = {
  id: string;
  status: "pending" | "resolved";
  title: string;
  source: "demo" | "api" | "integration";
  receipt: DecisionReceipt;
  review?: HumanReviewRecord;
  resolutionReceipt?: DecisionReceipt;
  createdAt: string;
  updatedAt: string;
};

type ReviewAction = "approve" | "reject" | "request_evidence";

export function ReviewInbox() {
  const searchParams = useSearchParams();
  const requestedCaseId = searchParams.get("case");
  const [cases, setCases] = useState<ReviewCaseView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(requestedCaseId);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<ReviewAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rationale, setRationale] = useState("Reviewed the current evidence, CI results, incident context, and documented exception criteria.");
  const [reviewerName, setReviewerName] = useState("Security Lead");
  const [requestedEvidence, setRequestedEvidence] = useState("Updated security validation\nCurrent owner approval");
  const [persistence, setPersistence] = useState<string>("loading");

  async function loadCases() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/reviews", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Review queue unavailable");
      const nextCases = (payload.cases ?? []) as ReviewCaseView[];
      setCases(nextCases);
      setPersistence(payload.persistence ?? "unknown");
      setSelectedId((current) => {
        if (requestedCaseId && nextCases.some((item) => item.id === requestedCaseId)) return requestedCaseId;
        if (current && nextCases.some((item) => item.id === current)) return current;
        return nextCases.find((item) => item.status === "pending")?.id ?? nextCases[0]?.id ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review queue unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCases(); }, []);

  const selected = useMemo(
    () => cases.find((item) => item.id === selectedId) ?? null,
    [cases, selectedId],
  );
  const activeReceipt = selected?.resolutionReceipt ?? selected?.receipt;
  const pendingCount = cases.filter((item) => item.status === "pending").length;

  async function submit(action: ReviewAction) {
    if (!selected) return;
    if (rationale.trim().length < 3) {
      setError("Add a short rationale before submitting a review action.");
      return;
    }
    setSubmitting(action);
    setError(null);
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(selected.id)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          rationale: rationale.trim(),
          reviewer: { id: slug(reviewerName) || "security-lead", name: reviewerName.trim() || "Security Lead" },
          requestedEvidence: action === "request_evidence" ? lines(requestedEvidence) : [],
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Review action failed");
      const updated = payload.case as ReviewCaseView;
      setCases((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review action failed");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) return <div className="reviewLoading"><span className="pulse" /> Loading review queue…</div>;

  if (!cases.length) {
    return (
      <EmptyState
        icon="✓"
        eyebrow="Review queue clear"
        title="No actions need human judgment."
        copy="When a VetoLayer evaluation returns REVIEW, the action appears here with its policy findings, SERV reasoning, evidence, and unresolved conditions."
        action={<ButtonLink tone="primary" href="/demo">Run the flagship REVIEW scenario →</ButtonLink>}
      />
    );
  }

  return (
    <div className="reviewWorkspace">
      <aside className="reviewQueuePane">
        <div className="reviewQueueHeader"><div><span>REVIEW QUEUE</span><strong>{pendingCount} pending</strong></div><small>{persistence}</small></div>
        <div className="reviewCaseList">
          {cases.map((item) => {
            const receipt = item.resolutionReceipt ?? item.receipt;
            return (
              <button key={item.id} className={selectedId === item.id ? "reviewCaseItem active" : "reviewCaseItem"} onClick={() => setSelectedId(item.id)}>
                <div><OutcomeBadge outcome={receipt.outcome} /><span className={item.status === "pending" ? "caseStatus pending" : "caseStatus"}>{item.status}</span></div>
                <strong>{item.title}</strong><small>{receipt.action.tool}.{receipt.action.operation}</small>
                <time>{formatTime(item.updatedAt)}</time>
              </button>
            );
          })}
        </div>
      </aside>

      {selected && activeReceipt ? (
        <section className="reviewDetailPane">
          <div className="reviewDetailTop">
            <div><p className="vlEyebrow">Human review · {selected.id}</p><h2>{selected.title}</h2><p>{activeReceipt.decisionSummary}</p></div>
            <OutcomeBadge outcome={activeReceipt.outcome} className="reviewOutcome" />
          </div>

          <div className="reviewContextStrip">
            <div><span>Actor</span><strong>{activeReceipt.actor.name ?? activeReceipt.actor.id}</strong></div>
            <div><span>Target</span><strong>{activeReceipt.action.targetId ?? activeReceipt.action.targetType}</strong></div>
            <div><span>Environment</span><strong>{activeReceipt.action.environment ?? "—"}</strong></div>
            <div><span>Integrity</span><strong className="mono">{activeReceipt.integrity.hash.slice(0, 12)}…</strong></div>
          </div>

          <div className="reviewEvidenceLayout">
            <div className="reviewReasoningColumn">
              <section className="reviewCard vlCard">
                <div className="reviewCardHead"><span>POLICY FINDINGS</span><small>{activeReceipt.deterministicFindings.length} rules · {activeReceipt.contextualFindings.length} SERV</small></div>
                {[...activeReceipt.deterministicFindings, ...activeReceipt.contextualFindings].map((finding) => (
                  <div className="reviewFinding" key={finding.id}>
                    <span className={`findingSource ${finding.source}`}>{finding.source === "contextual" ? "SERV" : "RULE"}</span>
                    <div><strong>{finding.policyId}</strong><p>{finding.summary}</p></div>
                    <i className={finding.status}>{finding.status}</i>
                  </div>
                ))}
              </section>

              <section className="reviewCard vlCard">
                <div className="reviewCardHead"><span>EVIDENCE CONSIDERED</span><small>{activeReceipt.evidenceUsed.length} items</small></div>
                {activeReceipt.evidenceUsed.map((evidence) => (
                  <details className="reviewEvidence" key={evidence.id}>
                    <summary><span className="evidenceVerified">✓</span><div><strong>{evidence.source.label ?? evidence.type}</strong><small>{evidence.type} · {evidence.verification.status}</small></div><span>View</span></summary>
                    <pre>{JSON.stringify(evidence.data ?? evidence.reference, null, 2)}</pre>
                  </details>
                ))}
              </section>

              {activeReceipt.missingEvidence.length ? (
                <section className="reviewCard unresolvedCard vlCard"><div className="reviewCardHead"><span>UNRESOLVED</span><small>{activeReceipt.missingEvidence.length} missing</small></div>{activeReceipt.requirementsToChangeOutcome.map((item) => <p className="unresolvedItem" key={item}>{item}</p>)}</section>
              ) : null}
            </div>

            <aside className="reviewActionPanel vlCard vlCardRaised">
              <div className="reviewActionIntro"><span>HUMAN JUDGMENT</span><h3>{selected.status === "pending" ? "Resolve this REVIEW" : "Review recorded"}</h3><p>A human action becomes evidence and triggers the entire policy + SERV pipeline again. It cannot override a hard BLOCK.</p></div>

              {selected.review ? (
                <div className="recordedReview">
                  <span>{selected.review.action.replace("_", " ").toUpperCase()}</span>
                  <strong>{selected.review.reviewer.name ?? selected.review.reviewer.id}</strong>
                  <p>{selected.review.rationale}</p>
                  <time>{formatTime(selected.review.submittedAt)}</time>
                </div>
              ) : null}

              {selected.status === "pending" ? (
                <>
                  <Field label="Reviewer"><Input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} /></Field>
                  <Field label="Rationale"><Textarea rows={5} value={rationale} onChange={(event) => setRationale(event.target.value)} /></Field>
                  <Field label="Evidence to request" hint="Used only for Request evidence. One item per line."><Textarea rows={3} value={requestedEvidence} onChange={(event) => setRequestedEvidence(event.target.value)} /></Field>
                  {error ? <Notice tone="danger" title="Review action failed" role="alert">{error}</Notice> : null}
                  <div className="reviewActionButtons">
                    <Button tone="primary" disabled={submitting !== null} onClick={() => submit("approve")}>{submitting === "approve" ? "Re-evaluating…" : "Approve & re-evaluate"}</Button>
                    <Button tone="secondary" disabled={submitting !== null} onClick={() => submit("request_evidence")}>{submitting === "request_evidence" ? "Re-evaluating…" : "Request evidence"}</Button>
                    <Button tone="danger" disabled={submitting !== null} onClick={() => submit("reject")}>{submitting === "reject" ? "Re-evaluating…" : "Reject & re-evaluate"}</Button>
                  </div>
                </>
              ) : (
                <div className="resolvedReviewMessage"><span>Decision re-evaluated</span><OutcomeBadge outcome={activeReceipt.outcome} /><p>The resulting receipt includes the human review inside the verified review-state evidence used by policy evaluation.</p></div>
              )}
            </aside>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function lines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }
function slug(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function formatTime(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

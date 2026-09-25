"use client";

import type { Actor, DecisionReceipt, Evidence, HumanReviewRecord } from "@vetolayer/core";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, ButtonLink, EmptyState, Field, Input, Notice, OutcomeBadge, Select, Textarea } from "./ui/primitives";

type Member = { userId: string; displayName?: string; email?: string; role: string };
type ReviewStatus = "pending" | "awaiting_evidence" | "resolved";
type ReviewAssignment = { userId: string; displayName?: string; email?: string; assignedAt: string };
type ReviewComment = { id: string; author: Actor; body: string; createdAt: string };
type ReviewEvidenceAddition = { id: string; evidence: Evidence; addedBy: Actor; note?: string; addedAt: string };
type ReviewTimelineEvent = { id: string; type: string; actor?: Actor; summary: string; createdAt: string; receiptId?: string };
type ReviewReceiptLineage = { receiptId: string; parentReceiptId?: string; outcome: "ALLOW" | "REVIEW" | "BLOCK"; createdAt: string; reason: string };
type ReviewCaseView = {
  id: string;
  revision: number;
  status: ReviewStatus;
  title: string;
  source: "demo" | "api" | "integration";
  receipt: DecisionReceipt;
  review?: HumanReviewRecord;
  reviewHistory: HumanReviewRecord[];
  resolutionReceipt?: DecisionReceipt;
  assignment?: ReviewAssignment;
  comments: ReviewComment[];
  evidenceAdditions: ReviewEvidenceAddition[];
  timeline: ReviewTimelineEvent[];
  receiptLineage: ReviewReceiptLineage[];
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
};

type ReviewAction = "assign" | "unassign" | "comment" | "approve" | "reject" | "request_evidence" | "add_evidence";

export function ReviewInbox() {
  const searchParams = useSearchParams();
  const requestedCaseId = searchParams.get("case");
  const [cases, setCases] = useState<ReviewCaseView[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(requestedCaseId);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<ReviewAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | ReviewStatus>("all");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine" | "unassigned">("all");
  const [rationale, setRationale] = useState("");
  const [requestedEvidence, setRequestedEvidence] = useState("");
  const [comment, setComment] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [evidenceType, setEvidenceType] = useState("security-validation");
  const [evidenceLabel, setEvidenceLabel] = useState("Reviewer supplied evidence");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
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
      setMembers(payload.members ?? []);
      setCurrentUserId(payload.currentUserId ?? "");
      setPersistence(payload.persistence ?? "unknown");
      setSelectedId((current) => {
        if (requestedCaseId && nextCases.some((item) => item.id === requestedCaseId)) return requestedCaseId;
        if (current && nextCases.some((item) => item.id === current)) return current;
        return nextCases.find((item) => item.status !== "resolved")?.id ?? nextCases[0]?.id ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review queue unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCases(); }, []);

  const visibleCases = useMemo(() => cases.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (ownerFilter === "mine" && item.assignment?.userId !== currentUserId) return false;
    if (ownerFilter === "unassigned" && item.assignment) return false;
    return true;
  }), [cases, currentUserId, ownerFilter, statusFilter]);
  const selected = useMemo(() => cases.find((item) => item.id === selectedId) ?? null, [cases, selectedId]);
  const activeReceipt = selected?.resolutionReceipt ?? selected?.receipt;
  const unresolvedCount = cases.filter((item) => item.status !== "resolved").length;

  useEffect(() => {
    if (!selected) return;
    setAssigneeUserId(selected.assignment?.userId ?? currentUserId);
    setRationale("");
    setRequestedEvidence(selected.receipt.missingEvidence.map((item) => item.description).join("\n"));
    setComment("");
    setEvidenceReference("");
    setNotice(null);
  }, [currentUserId, selectedId]);

  async function mutate(action: ReviewAction, extra: Record<string, unknown> = {}) {
    if (!selected) return;
    setSubmitting(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(selected.id)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedRevision: selected.revision, ...extra }),
      });
      const payload = await response.json();
      if (response.status === 409 && payload.case) {
        const current = payload.case as ReviewCaseView;
        setCases((items) => items.map((item) => item.id === current.id ? current : item));
        setNotice("This review changed while you were working. The latest version is loaded; check the new timeline before retrying.");
        return;
      }
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Review action failed");
      const updated = payload.case as ReviewCaseView;
      setCases((items) => items.map((item) => item.id === updated.id ? updated : item));
      setNotice(actionMessage(action, payload.outcome));
      if (action === "comment") setComment("");
      if (action === "add_evidence") { setEvidenceReference(""); setEvidenceNote(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review action failed");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) return <div className="reviewLoading"><span className="pulse" /> Loading review queue…</div>;
  if (!cases.length) {
    return <EmptyState icon="✓" eyebrow="Review queue clear" title="No actions need human judgment." copy="When VetoLayer returns REVIEW, the action appears here with ownership, evidence, policy findings, comments, and an auditable resolution timeline." action={<ButtonLink tone="primary" href="/demo">Run the flagship REVIEW scenario →</ButtonLink>} />;
  }

  return (
    <div className="reviewOpsShell">
      {error ? <Notice tone="danger" title="Review action failed" role="alert">{error}</Notice> : null}
      {notice ? <Notice tone="warning" title="Review workspace updated" role="status">{notice}</Notice> : null}

      <section className="reviewOpsToolbar vlCard">
        <div><span className="vlEyebrow">Queue control</span><strong>{unresolvedCount} unresolved</strong><small>{persistence} persistence</small></div>
        <Field label="Status"><Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="awaiting_evidence">Awaiting evidence</option><option value="resolved">Resolved</option></Select></Field>
        <Field label="Ownership"><Select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value as typeof ownerFilter)}><option value="all">Everyone</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></Select></Field>
        <Button size="sm" tone="secondary" onClick={() => void loadCases()}>Refresh</Button>
      </section>

      <div className="reviewWorkspace reviewOpsWorkspace">
        <aside className="reviewQueuePane">
          <div className="reviewQueueHeader"><div><span>REVIEW QUEUE</span><strong>{visibleCases.length} shown</strong></div></div>
          <div className="reviewCaseList">
            {visibleCases.map((item) => {
              const receipt = item.resolutionReceipt ?? item.receipt;
              return (
                <button key={item.id} className={selectedId === item.id ? "reviewCaseItem active" : "reviewCaseItem"} onClick={() => setSelectedId(item.id)}>
                  <div><OutcomeBadge outcome={receipt.outcome} /><span className={`caseStatus ${item.status}`}>{item.status.replace("_", " ")}</span></div>
                  <strong>{item.title}</strong>
                  <small>{item.assignment ? `Owner: ${item.assignment.displayName ?? item.assignment.email ?? item.assignment.userId}` : "Unassigned"}</small>
                  <small>{ageLabel(item.createdAt)} · {dueLabel(item.dueAt, item.status)}</small>
                </button>
              );
            })}
          </div>
        </aside>

        {selected && activeReceipt ? (
          <section className="reviewDetailPane">
            <div className="reviewDetailTop">
              <div><p className="vlEyebrow">Human review · revision {selected.revision}</p><h2>{selected.title}</h2><p>{activeReceipt.decisionSummary}</p></div>
              <div className="reviewOpsBadges"><OutcomeBadge outcome={activeReceipt.outcome} className="reviewOutcome" /><Badge tone={selected.status === "resolved" ? "success" : selected.status === "awaiting_evidence" ? "warning" : "accent"}>{selected.status.replace("_", " ")}</Badge></div>
            </div>

            <div className="reviewContextStrip">
              <div><span>Actor</span><strong>{activeReceipt.actor.name ?? activeReceipt.actor.id}</strong></div>
              <div><span>Target</span><strong>{activeReceipt.action.targetId ?? activeReceipt.action.targetType}</strong></div>
              <div><span>Age</span><strong>{ageLabel(selected.createdAt)}</strong></div>
              <div><span>Due</span><strong>{dueLabel(selected.dueAt, selected.status)}</strong></div>
            </div>

            <section className="reviewOpsOwnership vlCard">
              <div><span className="vlEyebrow">Ownership</span><strong>{selected.assignment ? selected.assignment.displayName ?? selected.assignment.email ?? selected.assignment.userId : "Unassigned"}</strong></div>
              <Field label="Assign reviewer"><Select value={assigneeUserId} onChange={(event) => setAssigneeUserId(event.target.value)}><option value="">Choose reviewer</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName ?? member.email ?? member.userId} · {member.role}</option>)}</Select></Field>
              <Button size="sm" disabled={!assigneeUserId || submitting !== null} onClick={() => void mutate("assign", { assigneeUserId })}>Assign</Button>
              {selected.assignment ? <Button size="sm" tone="ghost" disabled={submitting !== null} onClick={() => void mutate("unassign")}>Unassign</Button> : null}
            </section>

            <div className="reviewEvidenceLayout">
              <div className="reviewReasoningColumn">
                <section className="reviewCard vlCard">
                  <div className="reviewCardHead"><span>POLICY FINDINGS</span><small>{activeReceipt.deterministicFindings.length} rules · {activeReceipt.contextualFindings.length} SERV</small></div>
                  {[...activeReceipt.deterministicFindings, ...activeReceipt.contextualFindings].map((finding) => <div className="reviewFinding" key={finding.id}><span className={`findingSource ${finding.source}`}>{finding.source === "contextual" ? "SERV" : "RULE"}</span><div><strong>{finding.policyId}</strong><p>{finding.summary}</p></div><i className={finding.status}>{finding.status}</i></div>)}
                </section>

                <section className="reviewCard vlCard">
                  <div className="reviewCardHead"><span>REVIEWER EVIDENCE</span><small>{selected.evidenceAdditions.length} additions</small></div>
                  {selected.evidenceAdditions.length ? selected.evidenceAdditions.map((item) => <article className="reviewOpsEvidence" key={item.id}><div><strong>{item.evidence.source.label ?? item.evidence.type}</strong><Badge tone={item.evidence.verification.status === "verified" ? "success" : "warning"}>{item.evidence.verification.status}</Badge></div><p>{item.evidence.reference ?? "Structured evidence"}</p><small>Added by {item.addedBy.name ?? item.addedBy.id} · {formatTime(item.addedAt)}</small>{item.note ? <p>{item.note}</p> : null}</article>) : <p className="studioMuted">No reviewer-supplied evidence yet.</p>}
                  {selected.status !== "resolved" ? <div className="reviewOpsFormGrid"><Field label="Evidence type"><Input value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)} /></Field><Field label="Label"><Input value={evidenceLabel} onChange={(event) => setEvidenceLabel(event.target.value)} /></Field><Field label="Evidence details"><Textarea rows={3} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Link, verification result, approval reference, or concise evidence statement" /></Field><Field label="Reviewer note"><Textarea rows={3} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} /></Field><Button tone="secondary" disabled={submitting !== null || !evidenceType.trim() || !evidenceReference.trim()} onClick={() => void mutate("add_evidence", { evidenceType, evidenceLabel, evidenceReference, evidenceNote })}>{submitting === "add_evidence" ? "Re-evaluating…" : "Add evidence & re-evaluate"}</Button></div> : null}
                </section>

                <section className="reviewCard vlCard">
                  <div className="reviewCardHead"><span>INTERNAL NOTES</span><small>{selected.comments.length}</small></div>
                  {selected.comments.map((item) => <article className="reviewOpsComment" key={item.id}><strong>{item.author.name ?? item.author.id}</strong><p>{item.body}</p><small>{formatTime(item.createdAt)}</small></article>)}
                  <Field label="Add internal note"><Textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
                  <Button size="sm" disabled={submitting !== null || !comment.trim()} onClick={() => void mutate("comment", { comment })}>{submitting === "comment" ? "Saving…" : "Add note"}</Button>
                </section>

                <section className="reviewCard vlCard">
                  <div className="reviewCardHead"><span>RECEIPT LINEAGE</span><small>{selected.receiptLineage.length} receipts</small></div>
                  {selected.receiptLineage.map((item, index) => <article className="reviewOpsLineage" key={item.receiptId}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.outcome} · {item.reason.replace("-", " ")}</strong><p className="mono">{item.receiptId}</p><small>{formatTime(item.createdAt)}{item.parentReceiptId ? ` · parent ${item.parentReceiptId}` : " · original"}</small></div></article>)}
                </section>
              </div>

              <aside className="reviewActionPanel vlCard vlCardRaised">
                <div className="reviewActionIntro"><span>REVIEW OPERATIONS</span><h3>{selected.status === "resolved" ? "Resolution complete" : selected.status === "awaiting_evidence" ? "Waiting for evidence" : "Investigate and resolve"}</h3><p>Every reviewer action is appended to the case timeline. Approval is evidence and still runs through the normal policy + SERV pipeline; it cannot override a deterministic hard BLOCK.</p></div>

                {selected.status !== "resolved" ? <>
                  <Field label="Resolution rationale"><Textarea rows={5} value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Explain the evidence and reasoning behind this review action." /></Field>
                  <Field label="Evidence to request" hint="One item per line"><Textarea rows={4} value={requestedEvidence} onChange={(event) => setRequestedEvidence(event.target.value)} /></Field>
                  <div className="reviewActionButtons">
                    <Button tone="primary" disabled={submitting !== null || rationale.trim().length < 3} onClick={() => void mutate("approve", { rationale })}>{submitting === "approve" ? "Re-evaluating…" : "Approve & re-evaluate"}</Button>
                    <Button tone="secondary" disabled={submitting !== null || rationale.trim().length < 3 || !lines(requestedEvidence).length} onClick={() => void mutate("request_evidence", { rationale, requestedEvidence: lines(requestedEvidence) })}>{submitting === "request_evidence" ? "Requesting…" : "Request more evidence"}</Button>
                    <Button tone="danger" disabled={submitting !== null || rationale.trim().length < 3} onClick={() => void mutate("reject", { rationale })}>{submitting === "reject" ? "Re-evaluating…" : "Reject & re-evaluate"}</Button>
                  </div>
                </> : <div className="resolvedReviewMessage"><span>Final re-evaluation</span><OutcomeBadge outcome={activeReceipt.outcome} /><p>The original receipt remains intact. The final receipt and every intermediate re-evaluation remain linked in the timeline below.</p></div>}

                <div className="reviewOpsTimeline"><span className="vlEyebrow">Status timeline</span>{[...selected.timeline].reverse().map((event) => <article key={event.id}><i /><div><strong>{event.summary}</strong><small>{event.actor ? `${event.actor.name ?? event.actor.id} · ` : ""}{formatTime(event.createdAt)}</small>{event.receiptId ? <code>{event.receiptId}</code> : null}</div></article>)}</div>

                {selected.reviewHistory.length ? <div className="reviewOpsHistory"><span className="vlEyebrow">Reviewer decisions</span>{selected.reviewHistory.map((review) => <article key={review.id}><Badge tone={review.action === "approve" ? "success" : review.action === "reject" ? "danger" : "warning"}>{review.action.replace("_", " ")}</Badge><strong>{review.reviewer.name ?? review.reviewer.id}</strong><p>{review.rationale}</p><small>{formatTime(review.submittedAt)}</small></article>)}</div> : null}
              </aside>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function lines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }
function formatTime(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function ageLabel(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 60 * 60 * 1000) return `${Math.max(1, Math.floor(ms / 60000))}m old`;
  if (ms < 24 * 60 * 60 * 1000) return `${Math.floor(ms / 3600000)}h old`;
  return `${Math.floor(ms / 86400000)}d old`;
}
function dueLabel(value: string | undefined, status: ReviewStatus) {
  if (status === "resolved") return "Resolved";
  if (!value) return "No due time";
  const delta = new Date(value).getTime() - Date.now();
  if (delta <= 0) return `${Math.max(1, Math.floor(Math.abs(delta) / 3600000))}h overdue`;
  if (delta < 60 * 60 * 1000) return `due in ${Math.max(1, Math.floor(delta / 60000))}m`;
  return `due in ${Math.ceil(delta / 3600000)}h`;
}
function actionMessage(action: ReviewAction, outcome?: string) {
  if (action === "approve" || action === "reject" || action === "add_evidence") return `Re-evaluation completed${outcome ? ` with ${outcome}` : ""}.`;
  if (action === "request_evidence") return "Evidence request recorded; the case remains paused until new evidence is supplied.";
  if (action === "comment") return "Internal note added to the audit timeline.";
  if (action === "assign") return "Review ownership updated.";
  return "Review assignment cleared.";
}

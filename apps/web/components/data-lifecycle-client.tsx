"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DataLifecycleJob } from "../lib/server/data-lifecycle";

type Props = {
  workspaceName: string;
  role: "owner" | "admin" | "reviewer" | "member";
  retention: { decisionRetentionDays: number; reviewRetentionDays: number; notificationRetentionDays: number };
  members: Array<{ userId: string; email?: string; displayName?: string; role: string }>;
  currentUserId: string;
  initialJobs: DataLifecycleJob[];
  persistence: "supabase" | "memory";
};

type Notice = { tone: "success" | "danger" | "info"; message: string };

export function DataLifecycleClient(props: Props) {
  const router = useRouter();
  const [jobs, setJobs] = useState(props.initialJobs);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newOwner, setNewOwner] = useState("");
  const [removalConfirmation, setRemovalConfirmation] = useState("");

  const ownerCandidates = props.members.filter((member) => member.userId !== props.currentUserId);
  const activeRemoval = jobs.find((job) => job.kind === "workspace_delete" && ["queued", "scheduled", "running"].includes(job.status));

  async function workspaceAction(body: Record<string, unknown>, action: string) {
    setBusy(action); setNotice(null);
    try {
      const response = await fetch("/api/data-lifecycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { job?: DataLifecycleJob; error?: { message?: string } };
      if (!response.ok) { setNotice({ tone: "danger", message: result.error?.message ?? "The data lifecycle action could not be completed." }); return null; }
      if (result.job) setJobs((current) => [result.job!, ...current.filter((item) => item.id !== result.job!.id)]);
      return result;
    } catch {
      setNotice({ tone: "danger", message: "The data lifecycle service is temporarily unavailable." });
      return null;
    } finally { setBusy(null); }
  }

  async function exportWorkspace() {
    const result = await workspaceAction({ action: "export" }, "export");
    if (result?.job?.status === "completed") setNotice({ tone: "success", message: "Safe workspace export is ready. The JSON bundle includes a SHA-256 integrity digest." });
    else if (result) setNotice({ tone: "info", message: "Export job was created and can be retried if processing fails." });
  }

  async function transferOwnership() {
    if (!newOwner) return;
    const result = await workspaceAction({ action: "transfer_ownership", newOwnerUserId: newOwner }, "transfer");
    if (result) {
      setNotice({ tone: "success", message: "Workspace ownership transferred. Your role is now admin; the new owner controls destructive workspace actions." });
      router.refresh();
    }
  }

  async function scheduleRemoval() {
    const result = await workspaceAction({ action: "schedule_workspace_delete", confirmation: removalConfirmation }, "remove");
    if (result?.job) {
      setRemovalConfirmation("");
      setNotice({ tone: "info", message: `Workspace removal is scheduled for ${formatDate(result.job.scheduledFor)}. You can cancel it before processing starts.` });
    }
  }

  async function jobAction(job: DataLifecycleJob, action: "cancel" | "retry") {
    setBusy(`${action}:${job.id}`); setNotice(null);
    try {
      const response = await fetch(`/api/data-lifecycle/${encodeURIComponent(job.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json() as { job?: DataLifecycleJob; error?: { message?: string } };
      if (!response.ok || !result.job) { setNotice({ tone: "danger", message: result.error?.message ?? "Job action failed." }); return; }
      setJobs((current) => current.map((item) => item.id === result.job!.id ? result.job! : item));
      setNotice({ tone: result.job.status === "failed" ? "danger" : "success", message: action === "cancel" ? "The scheduled job was cancelled." : `Job is now ${result.job.status}.` });
    } catch { setNotice({ tone: "danger", message: "Job action failed." }); }
    finally { setBusy(null); }
  }

  return (
    <div className="dataLifecycleGrid">
      {notice ? <div className={`dataNotice ${notice.tone}`} role="status">{notice.message}</div> : null}

      <section className="dataCard dataInventoryCard">
        <div className="dataCardHead"><div><span>DATA INVENTORY</span><h2>What VetoLayer stores</h2></div><b>{props.persistence === "supabase" ? "Durable" : "Development memory"}</b></div>
        <div className="dataInventory">
          <article><strong>Decision Receipts</strong><p>Signed decision content, policy findings, evidence references, SERV trace metadata, review lineage, and integrity hashes.</p></article>
          <article><strong>Governance configuration</strong><p>Projects, environments, versioned policies, review cases, workspace members, retention settings, and plan assignment.</p></article>
          <article><strong>Append-only audit</strong><p>Administrative/security history is intentionally retained separately so project archive or workspace removal cannot silently rewrite incident history.</p></article>
          <article><strong>Never exported</strong><p>Raw API keys, key hashes, webhook signing secrets, GitHub credentials, invitation-token hashes, cookies, passwords, refresh tokens, and service-role credentials.</p></article>
        </div>
      </section>

      <section className="dataCard">
        <div className="dataCardHead"><div><span>SAFE EXPORT</span><h2>Portable workspace record</h2></div><b>JSON + SHA-256</b></div>
        <p>Creates a complete server-side snapshot of decisions/receipts, policy versions, reviews, members, project structure, retention settings, plan metadata, and append-only audit events.</p>
        <button className="primaryButton" type="button" disabled={Boolean(busy)} onClick={() => void exportWorkspace()}>{busy === "export" ? "Building export…" : "Create workspace export"}</button>
      </section>

      <section className="dataCard">
        <div className="dataCardHead"><div><span>RETENTION</span><h2>Operational history windows</h2></div><Link href="/dashboard/settings#data-retention">Manage →</Link></div>
        <ul className="dataFacts"><li>Decision receipts <b>{retentionLabel(props.retention.decisionRetentionDays)}</b></li><li>Review cases <b>{retentionLabel(props.retention.reviewRetentionDays)}</b></li><li>Notifications <b>{retentionLabel(props.retention.notificationRetentionDays)}</b></li><li>Security audit <b>Append-only / indefinite</b></li></ul>
      </section>

      {props.role === "owner" ? <section className="dataCard">
        <div className="dataCardHead"><div><span>OWNERSHIP</span><h2>Transfer before you leave</h2></div><b>Atomic</b></div>
        <p>Ownership transfer changes the current owner to admin and promotes the selected active member in one server transaction. There is never a two-owner or ownerless intermediate state.</p>
        <div className="dataInlineForm"><select value={newOwner} onChange={(event) => setNewOwner(event.target.value)}><option value="">Choose new owner</option>{ownerCandidates.map((member) => <option value={member.userId} key={member.userId}>{member.displayName ?? member.email ?? member.userId} · {member.role}</option>)}</select><button type="button" disabled={!newOwner || Boolean(busy)} onClick={() => void transferOwnership()}>{busy === "transfer" ? "Transferring…" : "Transfer ownership"}</button></div>
      </section> : null}

      {props.role === "owner" ? <section className="dataCard dataDanger">
        <div className="dataCardHead"><div><span>WORKSPACE OFFBOARDING</span><h2>Permanent workspace removal</h2></div><b>24h recovery</b></div>
        <p>Removal is delayed for 24 hours and creates a safe export immediately before deletion. Live projects, policies, credentials, integrations, reviews, notifications, and decisions are removed. Append-only audit events remain as historical security records and keep their original workspace identifier.</p>
        {activeRemoval ? <div className="dataScheduled"><strong>Removal scheduled</strong><span>{formatDate(activeRemoval.scheduledFor)}</span><button type="button" disabled={Boolean(busy)} onClick={() => void jobAction(activeRemoval, "cancel")}>Cancel removal</button></div> : <label className="dataConfirm"><span>Type <strong>REMOVE WORKSPACE {props.workspaceName}</strong></span><input value={removalConfirmation} onChange={(event) => setRemovalConfirmation(event.target.value)} placeholder={`REMOVE WORKSPACE ${props.workspaceName}`} /><button type="button" disabled={Boolean(busy) || removalConfirmation !== `REMOVE WORKSPACE ${props.workspaceName}`} onClick={() => void scheduleRemoval()}>{busy === "remove" ? "Scheduling…" : "Schedule removal"}</button></label>}
      </section> : null}

      <section className="dataCard dataJobsCard">
        <div className="dataCardHead"><div><span>JOBS</span><h2>Export & offboarding history</h2></div><b>{jobs.length}</b></div>
        {jobs.length ? <div className="dataJobs">{jobs.map((job) => <article key={job.id}><div><strong>{jobLabel(job.kind)}</strong><span>{job.status} · {formatDate(job.createdAt)}</span>{job.error ? <small>{job.error}</small> : null}</div><div className="dataJobActions">{job.status === "completed" && job.result?.export ? <a href={`/api/data-lifecycle/${encodeURIComponent(job.id)}/download`}>Download JSON</a> : null}{job.status === "failed" ? <button type="button" onClick={() => void jobAction(job, "retry")} disabled={Boolean(busy)}>Retry</button> : null}{["queued", "scheduled"].includes(job.status) ? <button type="button" onClick={() => void jobAction(job, "cancel")} disabled={Boolean(busy)}>Cancel</button> : null}</div></article>)}</div> : <p>No data lifecycle jobs yet.</p>}
      </section>

      <section className="dataCard">
        <div className="dataCardHead"><div><span>ACCOUNT</span><h2>Offboard your VetoLayer identity</h2></div><Link href="/account/offboarding">Account offboarding →</Link></div>
        <p>Account offboarding is separate from workspace removal. You must transfer or remove every workspace you own first. Historical receipts and append-only audit records retain their original actor identifiers for integrity; live membership and notification access is removed.</p>
      </section>
    </div>
  );
}

function formatDate(value?: string) { return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not scheduled"; }
function retentionLabel(days: number) { return days === 0 ? "Indefinite" : `${days} days`; }
function jobLabel(kind: DataLifecycleJob["kind"]) { return kind === "workspace_export" ? "Workspace export" : kind === "workspace_delete" ? "Workspace removal" : "Account offboarding"; }

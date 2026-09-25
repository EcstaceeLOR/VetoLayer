"use client";

import { useEffect, useState } from "react";

type AccountJob = { id: string; status: string; scheduledFor?: string; error?: string };
type OwnedWorkspace = { id: string; name: string; status: string };

export function AccountOffboardingPanel() {
  const [jobs, setJobs] = useState<AccountJob[]>([]);
  const [owned, setOwned] = useState<OwnedWorkspace[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/account/deletion", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { jobs?: AccountJob[]; ownedWorkspaces?: OwnedWorkspace[] };
    setJobs(result.jobs ?? []);
    setOwned(result.ownedWorkspaces ?? []);
  }

  useEffect(() => { void load(); }, []);
  const active = jobs.find((job) => ["queued", "scheduled", "running"].includes(job.status));
  const failed = jobs.find((job) => job.status === "failed");

  async function run(action: "schedule" | "cancel" | "retry", jobId?: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(jobId ? { jobId } : {}), ...(action === "schedule" ? { confirmation } : {}) }),
      });
      const result = await response.json() as { error?: { message?: string } };
      setMessage(response.ok ? (action === "schedule" ? "Account offboarding is scheduled with a 24-hour recovery window." : action === "cancel" ? "Account offboarding was cancelled." : "Offboarding job retried.") : result.error?.message ?? "Account offboarding could not be updated.");
      if (response.ok) setConfirmation("");
      await load();
    } catch {
      setMessage("Account offboarding service is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="accountDeletionPanel" id="account-deletion">
      <div>
        <p className="vlEyebrow">Account offboarding</p>
        <h2>End live access without rewriting governance history.</h2>
        <p>You must transfer or remove every workspace you own first. The scheduled job removes live memberships, notification state, and authentication access; signed receipts and append-only audit records keep their historical actor identifiers.</p>
      </div>
      {message ? <p role="status"><strong>{message}</strong></p> : null}
      {owned.length ? (
        <div><strong>Ownership blockers</strong><ul>{owned.map((workspace) => <li key={workspace.id}>{workspace.name} · {workspace.status}</li>)}</ul><a href="/dashboard/data">Resolve workspace ownership →</a></div>
      ) : active ? (
        <div><strong>Offboarding scheduled</strong><p>{active.scheduledFor ? new Date(active.scheduledFor).toLocaleString() : active.status}</p><button type="button" disabled={busy || active.status === "running"} onClick={() => void run("cancel", active.id)}>Cancel offboarding</button></div>
      ) : (
        <div><label><span>Type <strong>REMOVE MY ACCOUNT</strong></span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="REMOVE MY ACCOUNT" /></label><button type="button" disabled={busy || confirmation !== "REMOVE MY ACCOUNT"} onClick={() => void run("schedule")}>{busy ? "Scheduling…" : "Schedule account offboarding"}</button></div>
      )}
      {failed ? <button type="button" disabled={busy} onClick={() => void run("retry", failed.id)}>Retry failed offboarding</button> : null}
    </section>
  );
}

"use client";

import { useState } from "react";

export function ReceiptActions({ receiptId, receiptJson, initialVerified }: { receiptId: string; receiptJson: string; initialVerified: boolean }) {
  const [copied, setCopied] = useState(false);
  const [verified, setVerified] = useState<boolean>(initialVerified);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(receiptJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Your browser blocked clipboard access.");
    }
  }

  async function verify() {
    setVerifying(true);
    setError(null);
    try {
      const response = await fetch(`/api/decisions/${encodeURIComponent(receiptId)}/verify`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Integrity verification failed.");
      setVerified(Boolean(body.verified));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Integrity verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="receiptActionCluster">
      <button type="button" className="secondaryButton buttonReset" onClick={copyJson}>{copied ? "Copied JSON" : "Copy receipt JSON"}</button>
      <a className="secondaryButton" href={`/api/decisions/${encodeURIComponent(receiptId)}/export?format=json`}>Export JSON</a>
      <a className="secondaryButton" href={`/api/decisions/${encodeURIComponent(receiptId)}/export?format=text`}>Incident report</a>
      <button type="button" className="secondaryButton buttonReset" disabled={verifying} onClick={verify}>{verifying ? "Verifying…" : "Verify integrity"}</button>
      <span className={`integrityState ${verified ? "verified" : "invalid"}`}>
        {verified ? "Cryptographically verified" : "Integrity mismatch"}
      </span>
      {error ? <small className="receiptActionError" role="alert">{error}</small> : null}
    </div>
  );
}

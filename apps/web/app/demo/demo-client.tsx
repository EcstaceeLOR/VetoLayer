"use client";

import { useState } from "react";

type DemoResponse = {
  stage: "needs-approval" | "resolved";
  outcome: "ALLOW" | "REVIEW" | "BLOCK";
  summary: string;
  deterministicFindings: Array<{ id: string; policyId: string; status: string; summary: string }>;
  contextualFindings: Array<{ id: string; policyId: string; status: string; summary: string }>;
  requirementsToChangeOutcome: string[];
  trace: Array<{ step: string; status: string; summary: string }>;
  providerTrace?: Record<string, unknown>;
  receipt: { integrity: { hash: string }; receiptId: string };
  reviewCaseId?: string;
};

export function FlagshipDemoClient() {
  const [result, setResult] = useState<DemoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestDemo(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const payload = (await response.json()) as DemoResponse | { error: string };
    if (!response.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : "Evaluation failed");
    }
    return payload;
  }

  async function evaluate() {
    setLoading(true);
    setError(null);
    try {
      setResult(await requestDemo("/api/demo/evaluate", { stage: "needs-approval" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evaluation failed");
    } finally {
      setLoading(false);
    }
  }

  async function approveAndReevaluate() {
    if (!result?.reviewCaseId) return;
    setLoading(true);
    setError(null);
    try {
      setResult(
        await requestDemo("/api/demo/review", { reviewCaseId: result.reviewCaseId }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Re-evaluation failed");
    } finally {
      setLoading(false);
    }
  }

  async function resetDemo() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/reset", { method: "DELETE" });
      if (!response.ok) throw new Error("Demo reset failed");
      setResult(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Demo reset failed");
    } finally {
      setLoading(false);
    }
  }

  const approvalResolved = result?.stage === "resolved";

  return (
    <div className="demoExperience">
      <section className="demoScenario">
        <div className="demoCodeBar"><span className="pulse" /> Production action proposed by coding-agent</div>
        <div className="demoAction">
          <div>
            <span className="cardLabel">Requested action</span>
            <h2>Deploy PR #312 to production</h2>
            <p>Patch an active session-token replay vulnerability in authentication code.</p>
          </div>
          <span className="demoRisk">CRITICAL INCIDENT</span>
        </div>
        <div className="demoFacts">
          <div><span>Window</span><strong>Restricted</strong></div>
          <div><span>CI</span><strong>3/3 passing</strong></div>
          <div><span>Files</span><strong>Auth + security</strong></div>
          <div><span>Incident</span><strong>INC-2041</strong></div>
          <div><span>Human approval</span><strong className={approvalResolved ? "" : "factWarn"}>{approvalResolved ? "Verified" : "Missing"}</strong></div>
        </div>
        <div className="demoControls">
          <button className="demoButton secondaryDemoButton" disabled={loading} onClick={evaluate}>{loading && !result ? "Evaluating…" : "1. Evaluate current action"}</button>
          {result?.stage === "needs-approval" && result.outcome === "REVIEW" && result.reviewCaseId ? (
            <button className="demoButton" disabled={loading} onClick={approveAndReevaluate}>{loading ? "Re-evaluating…" : "2. Add demo security-lead approval & re-evaluate"}</button>
          ) : approvalResolved ? (
            <button className="demoButton" disabled>2. Approval evidence added</button>
          ) : (
            <button className="demoButton" disabled>2. Human review appears after REVIEW</button>
          )}
          {result || error ? <button className="demoButton secondaryDemoButton" disabled={loading} onClick={resetDemo}>Reset demo</button> : null}
        </div>
        <p className="demoControlNote">The security-lead approval is seeded demo evidence. The deterministic engine, SERV call, orchestration, and receipt generation are executed again for the second decision.</p>
        {error ? <p className="demoError" role="alert">{error}</p> : null}
      </section>

      <section className="demoDecisionPanel" aria-live="polite">
        {!result ? (
          <div className="demoEmpty">
            <span className="demoOrb">V</span>
            <h3>VetoLayer is waiting for the action.</h3>
            <p>Run the first evaluation to watch deterministic rules and SERV contextual reasoning operate on the same evidence bundle.</p>
          </div>
        ) : (
          <>
            <div className="demoOutcomeRow">
              <div><span className="cardLabel">VetoLayer decision</span><strong className={`demoOutcome ${result.outcome.toLowerCase()}`}>{result.outcome}</strong></div>
              <div className="servProof"><span className="pulse" /><span>SERV {String(result.providerTrace?.providerStatus ?? "trace")}</span></div>
            </div>
            <p className="demoSummary">{result.summary}</p>

            <div className="demoTrace">
              {result.trace.map((step, index) => (
                <div className="demoTraceStep" key={`${step.step}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{step.step.replaceAll("-", " ")}</strong><p>{step.summary}</p></div>
                </div>
              ))}
            </div>

            {result.requirementsToChangeOutcome.length ? (
              <div className="demoResolution"><span>Why execution stopped</span>{result.requirementsToChangeOutcome.map((requirement) => <p key={requirement}>{requirement}</p>)}</div>
            ) : (
              <div className="demoResolution successResolution"><span>Execution gate satisfied</span><p>Deterministic requirements and SERV contextual judgment both permit the action.</p></div>
            )}

            {result.outcome === "REVIEW" ? (
              <div className="demoReviewHandoff">
                <span>{result.stage === "resolved" ? "REVIEW REMAINS REQUIRED" : "HUMAN REVIEW CREATED"}</span>
                <p>{result.stage === "resolved" ? "The demo approval was added, but VetoLayer still requires review because another condition or SERV validation remains unresolved." : "The action is paused. Add the seeded security-lead approval above and the exact same policy + SERV pipeline will run again."}</p>
              </div>
            ) : null}

            <div className="demoReceipt"><span>Decision Receipt</span><code>{result.receipt.integrity.hash.slice(0, 26)}…</code></div>
          </>
        )}
      </section>
    </div>
  );
}

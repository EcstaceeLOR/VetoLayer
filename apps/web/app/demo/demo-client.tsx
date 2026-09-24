"use client";

import Link from "next/link";
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

  async function evaluate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "needs-approval" }),
      });
      const payload = (await response.json()) as DemoResponse | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Evaluation failed");
      }
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evaluation failed");
    } finally {
      setLoading(false);
    }
  }

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
          <div><span>Human approval</span><strong className="factWarn">Missing</strong></div>
        </div>
        <div className="demoControls">
          <button className="demoButton secondaryDemoButton" disabled={loading} onClick={evaluate}>{loading ? "Evaluating…" : "1. Evaluate current action"}</button>
          {result?.outcome === "REVIEW" && result.reviewCaseId ? (
            <Link className="demoButton demoReviewLink" href={`/dashboard/reviews?case=${encodeURIComponent(result.reviewCaseId)}`}>2. Open Human Review →</Link>
          ) : (
            <button className="demoButton" disabled>2. Human review appears after REVIEW</button>
          )}
        </div>
        {error ? <p className="demoError">{error}</p> : null}
      </section>

      <section className="demoDecisionPanel">
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
                <span>HUMAN REVIEW CREATED</span>
                <p>The action is paused. Approval, rejection, or a request for more evidence will be recorded and then the exact same policy + SERV pipeline runs again.</p>
                {result.reviewCaseId ? <Link href={`/dashboard/reviews?case=${encodeURIComponent(result.reviewCaseId)}`}>Open review case →</Link> : null}
              </div>
            ) : null}

            <div className="demoReceipt"><span>Decision Receipt</span><code>{result.receipt.integrity.hash.slice(0, 26)}…</code></div>
          </>
        )}
      </section>
    </div>
  );
}

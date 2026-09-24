"use client";

import Link from "next/link";
import { useState } from "react";
import type { IntegrationKey, IntegrationReadiness, IntegrationTestResult } from "../../../lib/integration-contracts";
import styles from "./integration-setup.module.css";

type Props = {
  initialReadiness: IntegrationReadiness;
};

const sdkSnippet = `import { createVetoLayerClient, guardedToolCall } from "@vetolayer/sdk";

const veto = createVetoLayerClient({
  baseUrl: process.env.VETOLAYER_URL!,
  apiKey: process.env.VETOLAYER_API_KEY,
  workspaceId: "production",
});

const result = await guardedToolCall({
  client: veto,
  evaluation,
  execute: () => highImpactToolCall(),
});`;

const githubSnippet = `const result = await evaluateGitHubPullRequest({
  owner: "acme",
  repo: "api",
  pullRequest: 42,
  githubToken: process.env.GITHUB_TOKEN!,
  operation: "merge-pull-request",
});`;

export function IntegrationSetup({ initialReadiness }: Props) {
  const [readiness, setReadiness] = useState(initialReadiness);
  const [results, setResults] = useState<Partial<Record<IntegrationKey, IntegrationTestResult>>>({});
  const [testing, setTesting] = useState<IntegrationKey | null>(null);

  async function testConnection(integration: IntegrationKey) {
    setTesting(integration);
    try {
      const response = await fetch("/api/integrations/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integration }),
      });
      const payload = (await response.json()) as {
        result?: IntegrationTestResult;
        readiness?: IntegrationReadiness;
        error?: { code?: string; message?: string };
      };

      if (payload.readiness) setReadiness(payload.readiness);
      if (payload.result) {
        setResults((current) => ({ ...current, [integration]: payload.result }));
      } else {
        setResults((current) => ({
          ...current,
          [integration]: {
            integration,
            ok: false,
            level: "error",
            code: payload.error?.code ?? "TEST_FAILED",
            message: payload.error?.message ?? "The connection test could not be completed.",
          },
        }));
      }
    } catch {
      setResults((current) => ({
        ...current,
        [integration]: {
          integration,
          ok: false,
          level: "error",
          code: "NETWORK_ERROR",
          message: "The browser could not reach the VetoLayer integration test endpoint.",
          nextSteps: ["Check the deployment and retry the test."],
        },
      }));
    } finally {
      setTesting(null);
    }
  }

  const github = readiness.github;
  const developerApi = readiness.developerApi;

  return (
    <div className={styles.stack}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.identity}>
            <div className={styles.icon}>GH</div>
            <div>
              <h2>GitHub Gate</h2>
              <p>Collect live pull-request, review, changed-file, and CI evidence before an autonomous coding agent merges or deploys.</p>
            </div>
          </div>
          <span className={`${styles.badge} ${github.ready ? styles.ready : styles.warning}`}>
            {github.ready ? "READY" : "NEEDS SETUP"}
          </span>
        </div>

        <div className={styles.body}>
          <div className={styles.column}>
            <p className={styles.label}>Setup</p>
            <ol className={styles.steps}>
              <li>Set <code>GITHUB_TOKEN</code> as a server-only environment variable with access to the repositories the gate will inspect.</li>
              <li>Configure <code>SERV_API_KEY</code> and <code>SERV_MODEL</code> so sensitive changes can receive contextual judgment.</li>
              <li>Redeploy or restart VetoLayer, then run the connection test below.</li>
              <li>Call the GitHub gate before the coding agent executes the protected action.</li>
            </ol>
            <pre className={styles.code}>{githubSnippet}</pre>
            <div className={styles.actions}>
              <button className={styles.testButton} type="button" onClick={() => testConnection("github")} disabled={testing === "github"}>
                {testing === "github" ? "Testing…" : "Test GitHub connection"}
              </button>
              <Link className={styles.secondaryLink} href="/demo">Open flagship demo →</Link>
            </div>
            <TestResult result={results.github} />
          </div>

          <div className={styles.column}>
            <p className={styles.label}>Configuration status</p>
            <div className={styles.configRow}><span>GitHub credential</span><strong className={!github.configured ? styles.missing : undefined}>{github.configured ? "Configured" : "Missing"}</strong></div>
            <div className={styles.configRow}><span>SERV contextual reasoning</span><strong className={!github.servConfigured ? styles.missing : undefined}>{github.servConfigured ? "Configured" : "Missing"}</strong></div>
            <div className={styles.configRow}><span>Gate readiness</span><strong>{github.ready ? "Ready to evaluate" : "Incomplete"}</strong></div>
            {github.missing.length > 0 ? (
              <div className={`${styles.result} ${styles.warning}`}>
                <strong>Required next</strong>
                <p>Add {github.missing.join(" and ")} on the server. Secret values are never returned to this page.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.identity}>
            <div className={styles.icon}>API</div>
            <div>
              <h2>Developer API + SDK</h2>
              <p>Put the same VetoLayer decision boundary in front of any agent or high-impact tool call without adopting another agent framework.</p>
              <span className={styles.endpoint}>POST {developerApi.endpoint}</span>
            </div>
          </div>
          <span className={`${styles.badge} ${developerApi.ready ? styles.ready : styles.warning}`}>
            {developerApi.state === "ready" ? "READY" : developerApi.state === "local-only" ? "LOCAL / DEMO" : "NEEDS SETUP"}
          </span>
        </div>

        <div className={styles.body}>
          <div className={styles.column}>
            <p className={styles.label}>Server-side TypeScript client</p>
            <pre className={styles.code}>{sdkSnippet}</pre>
            <div className={styles.actions}>
              <button className={styles.testButton} type="button" onClick={() => testConnection("developer-api")} disabled={testing === "developer-api"}>
                {testing === "developer-api" ? "Testing…" : "Test API configuration"}
              </button>
              <Link className={styles.secondaryLink} href="/dashboard/decisions">Inspect decisions →</Link>
            </div>
            <TestResult result={results["developer-api"]} />
          </div>

          <div className={styles.column}>
            <p className={styles.label}>Configuration status</p>
            <div className={styles.configRow}><span>Evaluation endpoint</span><strong>{developerApi.endpoint}</strong></div>
            <div className={styles.configRow}><span>Bearer authentication</span><strong className={!developerApi.authConfigured ? styles.missing : undefined}>{developerApi.authConfigured ? "Enabled" : "Not configured"}</strong></div>
            <div className={styles.configRow}><span>Production readiness</span><strong>{developerApi.ready ? "Ready" : "Needs API key"}</strong></div>
            {developerApi.missing.length > 0 ? (
              <div className={`${styles.result} ${styles.warning}`}>
                <strong>Required next</strong>
                <p>Set {developerApi.missing.join(" and ")} server-side before exposing the Developer API publicly.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className={styles.note}>
        <strong>Credential boundary:</strong> GitHub, SERV, and VetoLayer API secrets remain server-only. This screen receives readiness booleans and test outcomes only; it never renders or reads back credential values.
      </div>
    </div>
  );
}

function TestResult({ result }: { result?: IntegrationTestResult }) {
  if (!result) return null;
  return (
    <div className={`${styles.result} ${styles[result.level]}`} aria-live="polite">
      <strong>{result.code.replaceAll("_", " ")}</strong>
      <p>{result.message}</p>
      {result.details?.account ? <small>Connected GitHub account: {result.details.account}</small> : null}
      {result.details?.auth ? <small>Bearer authentication: {result.details.auth}</small> : null}
      {result.nextSteps?.length ? <ul className={styles.nextSteps}>{result.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul> : null}
    </div>
  );
}

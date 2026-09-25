"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Notice } from "../../../components/ui/primitives";
import type { GitHubConnectionPayload, GitHubRepositoryView, IntegrationReadiness, IntegrationTestResult } from "../../../lib/integration-contracts";
import styles from "./integration-setup.module.css";

type Props = { initialReadiness: IntegrationReadiness; initialGitHub: GitHubConnectionPayload; githubMessage?: string };
type GitHubMutationPayload = Partial<GitHubConnectionPayload> & { ok?: boolean; installation?: GitHubConnectionPayload["installation"]; repositories?: GitHubRepositoryView[]; missingPermissions?: string[]; error?: { code?: string; message?: string } };

const sdkSnippet = `import { createVetoLayerClient, guardedToolCall } from "@vetolayer/sdk";

const veto = createVetoLayerClient({
  baseUrl: process.env.VETOLAYER_URL!,
  apiKey: process.env.VETOLAYER_API_KEY,
});

const result = await guardedToolCall({
  client: veto,
  evaluation,
  execute: () => highImpactToolCall(),
});`;

const callbackMessages: Record<string, { tone: "success" | "warning" | "danger"; title: string; message: string }> = {
  connected: { tone: "success", title: "GitHub connected", message: "The GitHub App installation was verified and its repositories were synchronized for this VetoLayer scope." },
  permission_error: { tone: "danger", title: "GitHub permissions incomplete", message: "The installation is missing one or more read permissions VetoLayer needs to collect decision evidence." },
  suspended: { tone: "warning", title: "GitHub App suspended", message: "Unsuspend or reinstall the App before relying on this connection." },
  no_repositories: { tone: "warning", title: "No repositories available", message: "Update repository access in GitHub, then refresh this installation." },
  app_not_configured: { tone: "danger", title: "GitHub App unavailable", message: "A deployment administrator must complete the one-time GitHub App registration first." },
  persistence_required: { tone: "danger", title: "Durable persistence required", message: "Production GitHub installations require Supabase persistence." },
  state_invalid: { tone: "danger", title: "Installation link expired", message: "The one-time installation state is invalid, expired, or already used. Start again from this page." },
  installation_not_authorized: { tone: "danger", title: "Installation not authorized", message: "The signed-in GitHub user could not prove access to that installation." },
  forbidden: { tone: "danger", title: "Workspace permission changed", message: "Your current workspace role no longer allows integration changes." },
  scope_invalid: { tone: "danger", title: "Project context changed", message: "Select an active project/environment and start the installation again." },
  callback_invalid: { tone: "danger", title: "GitHub callback incomplete", message: "GitHub did not return the information required to bind this installation safely." },
  connection_failed: { tone: "danger", title: "GitHub connection failed", message: "VetoLayer could not safely complete the installation. Check App permissions and retry." },
};

export function IntegrationSetup({ initialReadiness, initialGitHub, githubMessage }: Props) {
  const [readiness, setReadiness] = useState(initialReadiness);
  const [github, setGitHub] = useState(initialGitHub);
  const [selectedRepositories, setSelectedRepositories] = useState<number[]>(initialGitHub.repositories.filter((repo) => repo.connected).map((repo) => repo.repositoryId));
  const [developerResult, setDeveloperResult] = useState<IntegrationTestResult>();
  const [developerBusy, setDeveloperBusy] = useState(false);
  const [githubBusy, setGitHubBusy] = useState<string>();
  const [githubError, setGitHubError] = useState<string>();
  const [missingPermissions, setMissingPermissions] = useState<string[]>([]);
  const [evaluation, setEvaluation] = useState<{ repositoryId: number | ""; pullRequest: string; operation: string }>({ repositoryId: initialGitHub.repositories.find((repo) => repo.connected)?.repositoryId ?? "", pullRequest: "", operation: "merge-pull-request" });
  const [evaluationResult, setEvaluationResult] = useState<{ outcome?: string; summary?: string; receiptId?: string; error?: string }>();

  const connectedRepositories = useMemo(() => github.repositories.filter((repo) => repo.connected), [github.repositories]);
  const installation = github.installation;
  const githubReady = installation?.state === "ready" && connectedRepositories.length > 0;
  const callbackNotice = githubMessage ? callbackMessages[githubMessage] : undefined;

  function mergeGitHub(payload: GitHubMutationPayload) {
    setGitHub((current) => ({
      ...current,
      ...(payload.app ? { app: payload.app } : {}),
      ...(payload.persistence ? { persistence: payload.persistence } : {}),
      ...(payload.scope ? { scope: payload.scope } : {}),
      ...(payload.installation !== undefined ? { installation: payload.installation } : {}),
      ...(payload.repositories ? { repositories: payload.repositories } : {}),
    }));
    if (payload.repositories) {
      const ids = payload.repositories.filter((repo) => repo.connected).map((repo) => repo.repositoryId);
      setSelectedRepositories(ids);
      setEvaluation((current) => ({ ...current, repositoryId: ids.includes(Number(current.repositoryId)) ? current.repositoryId : ids[0] ?? "" }));
    }
    if (payload.missingPermissions) setMissingPermissions(payload.missingPermissions);
  }

  async function mutateGitHub(action: "refresh" | "test" | "disconnect" | "select", repositoryIds?: number[]) {
    setGitHubBusy(action);
    setGitHubError(undefined);
    try {
      const response = await fetch("/api/integrations/github", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(repositoryIds ? { repositoryIds } : {}) }) });
      const payload = await response.json() as GitHubMutationPayload;
      if (!response.ok) return setGitHubError(payload.error?.message ?? "The GitHub connection could not be updated.");
      mergeGitHub(payload);
    } catch {
      setGitHubError("The browser could not reach VetoLayer's GitHub connection endpoint.");
    } finally {
      setGitHubBusy(undefined);
    }
  }

  async function testDeveloperApi() {
    setDeveloperBusy(true);
    try {
      const response = await fetch("/api/integrations/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ integration: "developer-api" }) });
      const payload = await response.json() as { result?: IntegrationTestResult; readiness?: IntegrationReadiness; error?: { code?: string; message?: string } };
      if (payload.readiness) setReadiness(payload.readiness);
      setDeveloperResult(payload.result ?? { integration: "developer-api", ok: false, level: "error", code: payload.error?.code ?? "TEST_FAILED", message: payload.error?.message ?? "The API configuration test could not be completed." });
    } catch {
      setDeveloperResult({ integration: "developer-api", ok: false, level: "error", code: "NETWORK_ERROR", message: "The browser could not reach the integration test endpoint." });
    } finally {
      setDeveloperBusy(false);
    }
  }

  async function evaluatePullRequest() {
    if (evaluation.repositoryId === "" || !/^\d+$/.test(evaluation.pullRequest) || Number(evaluation.pullRequest) < 1) {
      return setEvaluationResult({ error: "Choose a connected repository and enter a positive pull-request number." });
    }
    setGitHubBusy("evaluate");
    setEvaluationResult(undefined);
    try {
      const response = await fetch("/api/integrations/github/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repositoryId: evaluation.repositoryId, pullRequest: Number(evaluation.pullRequest), operation: evaluation.operation }) });
      const payload = await response.json() as { outcome?: string; summary?: string; receipt?: { receiptId?: string }; error?: { message?: string } };
      if (!response.ok) return setEvaluationResult({ error: payload.error?.message ?? "VetoLayer could not evaluate that pull request." });
      setEvaluationResult({ outcome: payload.outcome, summary: payload.summary, receiptId: payload.receipt?.receiptId });
    } catch {
      setEvaluationResult({ error: "The browser could not reach the GitHub evaluation endpoint." });
    } finally {
      setGitHubBusy(undefined);
    }
  }

  return (
    <div className={styles.stack}>
      {callbackNotice ? <Notice tone={callbackNotice.tone} title={callbackNotice.title}>{callbackNotice.message}</Notice> : null}

      <Card className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.identity}><div className={styles.icon}>GH</div><div><h2>GitHub App</h2><p>Install VetoLayer into GitHub, choose repositories, and collect PR, review, changed-file, and CI evidence with short-lived installation credentials.</p></div></div>
          <Badge tone={githubReady ? "success" : installation?.state === "suspended" || installation?.state === "permission-error" ? "warning" : "neutral"}>{githubReady ? "Connected" : installation ? installation.state.replaceAll("-", " ") : github.app.configured ? "Not installed" : "App setup required"}</Badge>
        </div>

        <div className={styles.body}>
          <div className={styles.column}>
            <p className={styles.label}>Project connection</p>
            {!github.app.configured ? <Notice tone="warning" title="One-time deployment setup required">A VetoLayer administrator must register the GitHub App once. End users never paste personal access tokens or edit deployment variables to connect repositories.</Notice> : !installation ? (
              <div className={styles.installPanel}><h3>Install VetoLayer in GitHub</h3><p>GitHub will ask which account and repositories the App may access. VetoLayer binds the verified installation to the workspace, project, and environment currently selected.</p><div className={styles.actions}><a className={styles.primaryAction} href="/api/integrations/github/install">Install GitHub App</a><Link className={styles.secondaryLink} href="/onboarding">Return to setup wizard</Link></div></div>
            ) : (
              <><div className={styles.connectionMeta}><div><span>GitHub account</span><strong>{installation.accountLogin}</strong></div><div><span>Installation</span><strong>#{installation.installationId}</strong></div><div><span>Repository access</span><strong>{installation.repositorySelection}</strong></div><div><span>Connected in VetoLayer</span><strong>{connectedRepositories.length}</strong></div></div><div className={styles.actions}><Button tone="secondary" type="button" onClick={() => mutateGitHub("refresh")} disabled={Boolean(githubBusy)}>{githubBusy === "refresh" ? "Refreshing…" : "Refresh from GitHub"}</Button><Button tone="ghost" type="button" onClick={() => mutateGitHub("test")} disabled={Boolean(githubBusy)}>{githubBusy === "test" ? "Testing…" : "Test installation"}</Button><a className={styles.secondaryLink} href="/api/integrations/github/install">Change GitHub access</a><Button tone="danger" type="button" onClick={() => mutateGitHub("disconnect")} disabled={Boolean(githubBusy)}>{githubBusy === "disconnect" ? "Disconnecting…" : "Disconnect"}</Button></div></>
            )}
            {githubError ? <Notice tone="danger" title="GitHub connection error">{githubError}</Notice> : null}
            {missingPermissions.length ? <Notice tone="danger" title="Missing GitHub permissions">Grant {missingPermissions.join(", ")} to the VetoLayer GitHub App, then refresh this installation.</Notice> : null}

            {installation && github.repositories.length ? <div className={styles.repositorySection}><div className={styles.sectionHeading}><div><p className={styles.label}>Repositories</p><small>Only saved repository selections can be evaluated by this VetoLayer scope.</small></div><Button tone="secondary" size="sm" type="button" onClick={() => mutateGitHub("select", selectedRepositories)} disabled={Boolean(githubBusy)}>{githubBusy === "select" ? "Saving…" : "Save selection"}</Button></div><div className={styles.repoList}>{github.repositories.map((repo) => <label className={styles.repoRow} key={repo.repositoryId}><input type="checkbox" checked={selectedRepositories.includes(repo.repositoryId)} onChange={(event) => setSelectedRepositories((current) => event.target.checked ? [...new Set([...current, repo.repositoryId])] : current.filter((id) => id !== repo.repositoryId))} disabled={Boolean(githubBusy)} /><span className={styles.repoIdentity}><strong>{repo.fullName}</strong><small>{repo.private ? "Private" : "Public"} · default {repo.defaultBranch}{repo.connected ? " · connected" : ""}</small></span></label>)}</div></div> : null}

            {githubReady ? <div className={styles.evaluatePanel}><div><p className={styles.label}>Live evidence test</p><small>Run a real connected pull request through the GitHub Gate. This creates a Decision Receipt and, when required, a Human Review case.</small></div><div className={styles.evaluateGrid}><label><span>Repository</span><select value={evaluation.repositoryId} onChange={(event) => setEvaluation((current) => ({ ...current, repositoryId: Number(event.target.value) }))}>{connectedRepositories.map((repo) => <option key={repo.repositoryId} value={repo.repositoryId}>{repo.fullName}</option>)}</select></label><label><span>Pull request</span><input inputMode="numeric" pattern="[0-9]*" value={evaluation.pullRequest} onChange={(event) => setEvaluation((current) => ({ ...current, pullRequest: event.target.value }))} placeholder="42" /></label><label><span>Operation</span><select value={evaluation.operation} onChange={(event) => setEvaluation((current) => ({ ...current, operation: event.target.value }))}><option value="merge-pull-request">Merge pull request</option><option value="deploy-production">Deploy production</option><option value="security-sensitive-change">Security-sensitive change</option><option value="modify-protected-configuration">Protected configuration</option></select></label></div><div className={styles.actions}><Button tone="primary" type="button" onClick={evaluatePullRequest} disabled={Boolean(githubBusy)}>{githubBusy === "evaluate" ? "Evaluating…" : "Evaluate pull request"}</Button></div>{evaluationResult?.error ? <Notice tone="danger" title="Evaluation failed safely">{evaluationResult.error}</Notice> : null}{evaluationResult?.outcome ? <Notice tone={evaluationResult.outcome === "ALLOW" ? "success" : evaluationResult.outcome === "BLOCK" ? "danger" : "warning"} title={`Decision: ${evaluationResult.outcome}`}>{evaluationResult.summary ?? "Evaluation completed."}{evaluationResult.receiptId ? <> <Link href={`/dashboard/decisions/${encodeURIComponent(evaluationResult.receiptId)}`}>Open Decision Receipt →</Link></> : null}</Notice> : null}</div> : null}
          </div>

          <div className={styles.column}><p className={styles.label}>Connection health</p><div className={styles.configRow}><span>GitHub App registration</span><strong className={!github.app.configured ? styles.missing : undefined}>{github.app.configured ? "Configured" : "Needs admin setup"}</strong></div><div className={styles.configRow}><span>Project installation</span><strong>{installation ? installation.state.replaceAll("-", " ") : "Not installed"}</strong></div><div className={styles.configRow}><span>Connected repositories</span><strong>{connectedRepositories.length}</strong></div><div className={styles.configRow}><span>SERV contextual reasoning</span><strong className={!readiness.github.servConfigured ? styles.missing : undefined}>{readiness.github.servConfigured ? "Configured" : "Missing"}</strong></div><div className={styles.configRow}><span>Last GitHub sync</span><strong>{installation?.lastSyncAt ? new Date(installation.lastSyncAt).toLocaleString() : "Never"}</strong></div><div className={styles.configRow}><span>Last signed webhook</span><strong>{installation?.lastEventAt ? new Date(installation.lastEventAt).toLocaleString() : "None yet"}</strong></div><div className={styles.permissionList}><span>Least-privilege repository permissions</span>{Object.entries(github.app.requiredPermissions).map(([permission, access]) => <code key={permission}>{permission}: {access}</code>)}</div>{installation?.state === "revoked" ? <Notice tone="danger" title="Installation revoked">GitHub no longer recognizes this installation. Reinstall VetoLayer to reconnect.</Notice> : null}{installation?.state === "suspended" ? <Notice tone="warning" title="Installation suspended">Unsuspend the App in GitHub and refresh before running actions.</Notice> : null}</div>
        </div>
      </Card>

      <Card className={styles.card}>
        <div className={styles.cardHeader}><div className={styles.identity}><div className={styles.icon}>API</div><div><h2>Developer API + SDK</h2><p>Put the same decision boundary in front of any agent or high-impact tool call without adopting another agent framework.</p><span className={styles.endpoint}>POST {readiness.developerApi.endpoint}</span></div></div><Badge tone={readiness.developerApi.ready ? "success" : readiness.developerApi.state === "local-only" ? "info" : "warning"}>{readiness.developerApi.state === "ready" ? "Ready" : readiness.developerApi.state === "local-only" ? "Local / demo" : "Needs setup"}</Badge></div>
        <div className={styles.body}><div className={styles.column}><p className={styles.label}>Server-side TypeScript client</p><pre className={styles.code}>{sdkSnippet}</pre><div className={styles.actions}><Button tone="secondary" type="button" onClick={testDeveloperApi} disabled={developerBusy}>{developerBusy ? "Testing…" : "Test API configuration"}</Button><Link className={styles.secondaryLink} href="/dashboard/decisions">Inspect decisions →</Link></div><TestResult result={developerResult} /></div><div className={styles.column}><p className={styles.label}>Configuration status</p><div className={styles.configRow}><span>Evaluation endpoint</span><strong>{readiness.developerApi.endpoint}</strong></div><div className={styles.configRow}><span>Bearer authentication</span><strong className={!readiness.developerApi.authConfigured ? styles.missing : undefined}>{readiness.developerApi.authConfigured ? "Enabled" : "Not configured"}</strong></div><div className={styles.configRow}><span>Production readiness</span><strong>{readiness.developerApi.ready ? "Ready" : "Needs API key"}</strong></div>{readiness.developerApi.missing.length ? <Notice tone="warning" title="Required next">Set {readiness.developerApi.missing.join(" and ")} server-side before exposing the Developer API publicly.</Notice> : null}</div></div>
      </Card>

      <Notice tone="info" title="Credential boundary">GitHub installation tokens are minted server-side, expire automatically, and are never returned to the browser or written to VetoLayer metadata. SERV and VetoLayer API secrets remain server-only as well.</Notice>
    </div>
  );
}

function TestResult({ result }: { result?: IntegrationTestResult }) {
  if (!result) return null;
  return <div aria-live="polite"><Notice tone={result.level === "success" ? "success" : result.level === "warning" ? "warning" : "danger"} title={result.code.replaceAll("_", " ")}>{result.message}</Notice>{result.details?.account ? <small className={styles.testMeta}>Account: {result.details.account}</small> : null}{result.details?.auth ? <small className={styles.testMeta}>Bearer authentication: {result.details.auth}</small> : null}{result.nextSteps?.length ? <ul className={styles.nextSteps}>{result.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul> : null}</div>;
}

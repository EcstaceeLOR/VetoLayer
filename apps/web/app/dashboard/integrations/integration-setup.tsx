"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge, Button, ButtonLink, Card, Field, Input, Notice, OutcomeBadge, Select } from "../../../components/ui/primitives";
import type {
  GitHubInstallationView,
  IntegrationReadiness,
  IntegrationTestResult,
} from "../../../lib/integration-contracts";
import styles from "./integration-setup.module.css";

type Props = {
  initialReadiness: IntegrationReadiness;
  initialGitHubInstallations: GitHubInstallationView[];
  canManageGitHub: boolean;
  githubNotice?: { tone: "success" | "danger"; title: string; message: string };
};

type UiNotice = { tone: "success" | "warning" | "danger" | "info"; title: string; message: string };

type GitHubEvaluation = {
  receipt: {
    receiptId: string;
    outcome: "ALLOW" | "REVIEW" | "BLOCK";
    decisionSummary: string;
  };
  snapshot: {
    repository: string;
    pullRequest: number;
    title: string;
    url: string;
    checks: number;
    reviews: number;
    changedFiles: number;
  };
};

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

export function IntegrationSetup({
  initialReadiness,
  initialGitHubInstallations,
  canManageGitHub,
  githubNotice,
}: Props) {
  const [readiness, setReadiness] = useState(initialReadiness);
  const [installations, setInstallations] = useState(initialGitHubInstallations);
  const [apiResult, setApiResult] = useState<IntegrationTestResult>();
  const [testingApi, setTestingApi] = useState(false);
  const [githubBusy, setGithubBusy] = useState<number | "evaluation" | null>(null);
  const [githubMessage, setGithubMessage] = useState<UiNotice | null>(githubNotice ?? null);
  const firstActive = initialGitHubInstallations.find((item) => item.status === "active") ?? initialGitHubInstallations[0];
  const [selectedInstallationId, setSelectedInstallationId] = useState(firstActive?.installationId ?? 0);
  const [selectedRepository, setSelectedRepository] = useState(firstActive?.repositories[0]?.fullName ?? "");
  const [pullRequest, setPullRequest] = useState("");
  const [operation, setOperation] = useState("merge-pull-request");
  const [evaluation, setEvaluation] = useState<GitHubEvaluation>();

  const selectedInstallation = useMemo(
    () => installations.find((item) => item.installationId === selectedInstallationId)
      ?? installations.find((item) => item.status === "active")
      ?? installations[0],
    [installations, selectedInstallationId],
  );

  useEffect(() => {
    if (!selectedInstallation) {
      setSelectedRepository("");
      return;
    }
    if (!selectedInstallation.repositories.some((repository) => repository.fullName === selectedRepository)) {
      setSelectedRepository(selectedInstallation.repositories[0]?.fullName ?? "");
    }
  }, [selectedInstallation, selectedRepository]);

  const github = readiness.github;
  const developerApi = readiness.developerApi;
  const activeInstallations = installations.filter((item) => item.status === "active");
  const connectedRepositoryCount = activeInstallations.reduce((sum, item) => sum + item.repositories.length, 0);

  async function testDeveloperApi() {
    setTestingApi(true);
    try {
      const response = await fetch("/api/integrations/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integration: "developer-api" }),
      });
      const payload = await response.json() as {
        result?: IntegrationTestResult;
        readiness?: IntegrationReadiness;
        error?: { code?: string; message?: string };
      };
      if (payload.readiness) setReadiness(payload.readiness);
      setApiResult(payload.result ?? {
        integration: "developer-api",
        ok: false,
        level: "error",
        code: payload.error?.code ?? "TEST_FAILED",
        message: payload.error?.message ?? "The Developer API check could not be completed.",
      });
    } catch {
      setApiResult({
        integration: "developer-api",
        ok: false,
        level: "error",
        code: "NETWORK_ERROR",
        message: "The browser could not reach the VetoLayer integration endpoint.",
      });
    } finally {
      setTestingApi(false);
    }
  }

  async function refreshInstallation(installationId: number) {
    setGithubBusy(installationId);
    setGithubMessage(null);
    try {
      const response = await fetch(`/api/github/installations/${installationId}`, { method: "POST" });
      const payload = await response.json() as { connection?: GitHubInstallationView; error?: { message?: string } };
      if (!response.ok || !payload.connection) throw new Error(payload.error?.message ?? "GitHub refresh failed.");
      setInstallations((current) => current.map((item) => item.installationId === installationId ? payload.connection! : item));
      setGithubMessage({ tone: payload.connection.status === "active" ? "success" : "warning", title: "GitHub refreshed", message: payload.connection.status === "active" ? `${payload.connection.repositories.length} repositories are currently available to VetoLayer.` : `The installation is ${payload.connection.status}.` });
    } catch (error) {
      setGithubMessage({ tone: "danger", title: "Refresh failed", message: error instanceof Error ? error.message : "GitHub refresh failed." });
    } finally {
      setGithubBusy(null);
    }
  }

  async function disconnectInstallation(installationId: number) {
    if (!window.confirm("Disconnect this GitHub installation from the current VetoLayer project and environment? This does not uninstall the GitHub App from GitHub.")) return;
    setGithubBusy(installationId);
    setGithubMessage(null);
    try {
      const response = await fetch(`/api/github/installations/${installationId}`, { method: "DELETE" });
      const payload = await response.json() as { disconnected?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.disconnected) throw new Error(payload.error?.message ?? "GitHub disconnect failed.");
      const next = installations.filter((item) => item.installationId !== installationId);
      setInstallations(next);
      const replacement = next.find((item) => item.status === "active") ?? next[0];
      setSelectedInstallationId(replacement?.installationId ?? 0);
      setGithubMessage({ tone: "success", title: "GitHub disconnected", message: "The installation is no longer attached to this VetoLayer project environment." });
    } catch (error) {
      setGithubMessage({ tone: "danger", title: "Disconnect failed", message: error instanceof Error ? error.message : "GitHub disconnect failed." });
    } finally {
      setGithubBusy(null);
    }
  }

  async function evaluatePullRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pr = Number(pullRequest);
    if (!selectedInstallation || !selectedRepository || !Number.isInteger(pr) || pr < 1) return;
    const separator = selectedRepository.indexOf("/");
    if (separator < 1) return;
    setGithubBusy("evaluation");
    setGithubMessage(null);
    setEvaluation(undefined);
    try {
      const response = await fetch("/api/github/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId: selectedInstallation.installationId,
          owner: selectedRepository.slice(0, separator),
          repo: selectedRepository.slice(separator + 1),
          pullRequest: pr,
          operation,
        }),
      });
      const payload = await response.json() as GitHubEvaluation & { error?: { message?: string } };
      if (!response.ok || !payload.receipt) throw new Error(payload.error?.message ?? "The pull request could not be evaluated.");
      setEvaluation(payload);
      setGithubMessage({ tone: "success", title: "Live GitHub decision created", message: "VetoLayer collected current pull-request, review, file, and check evidence through the GitHub App and produced a Decision Receipt." });
    } catch (error) {
      setGithubMessage({ tone: "danger", title: "Evaluation failed", message: error instanceof Error ? error.message : "The pull request could not be evaluated." });
    } finally {
      setGithubBusy(null);
    }
  }

  return (
    <div className={styles.stack}>
      {githubMessage ? <Notice tone={githubMessage.tone} title={githubMessage.title}>{githubMessage.message}</Notice> : null}

      <Card className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.identity}>
            <div className={styles.icon}>GH</div>
            <div>
              <h2>GitHub App</h2>
              <p>Install VetoLayer on the repositories autonomous coding agents can touch. VetoLayer mints short-lived installation tokens server-side only when it needs live pull-request evidence.</p>
            </div>
          </div>
          <Badge tone={activeInstallations.length ? "success" : github.appConfigured ? "warning" : "danger"}>
            {activeInstallations.length ? `${connectedRepositoryCount} repos connected` : github.appConfigured ? "Install required" : "App unavailable"}
          </Badge>
        </div>

        <div className={styles.body}>
          <div className={styles.column}>
            <p className={styles.label}>Connection lifecycle</p>
            {!github.appConfigured ? (
              <Notice tone="danger" title="Deployment setup required">The VetoLayer GitHub App has not been registered by the deployment operator yet. End users should never need to paste a personal access token into VetoLayer.</Notice>
            ) : installations.length === 0 ? (
              <div className={styles.installEmpty}>
                <h3>No GitHub installation attached</h3>
                <p>Connect the current VetoLayer project and environment to a GitHub App installation, then choose exactly which repositories VetoLayer can inspect.</p>
                {canManageGitHub ? <ButtonLink href="/api/github/install/start?returnTo=/dashboard/integrations" tone="primary" size="lg">Connect GitHub</ButtonLink> : <Notice tone="info" title="Read-only role">Ask a workspace Owner or Admin to connect GitHub for this project.</Notice>}
              </div>
            ) : (
              <div className={styles.installList}>
                {installations.map((installation) => (
                  <section className={styles.installation} key={installation.installationId}>
                    <div className={styles.installationHead}>
                      <div>
                        <strong>{installation.accountLogin}</strong>
                        <span>{installation.accountType} · Installation #{installation.installationId}</span>
                      </div>
                      <Badge tone={installation.status === "active" ? "success" : installation.status === "suspended" ? "warning" : "danger"}>{installation.status}</Badge>
                    </div>
                    <div className={styles.installationMeta}>
                      <span>{installation.repositories.length} repositories</span>
                      <span>{installation.repositorySelection === "all" ? "All repositories" : "Selected repositories"}</span>
                      {installation.lastSyncedAt ? <span>Synced {new Date(installation.lastSyncedAt).toLocaleString()}</span> : null}
                    </div>
                    <div className={styles.repositoryList}>
                      {installation.repositories.length ? installation.repositories.map((repository) => (
                        <a key={repository.id} href={repository.htmlUrl} target="_blank" rel="noreferrer" className={styles.repositoryRow}>
                          <span><strong>{repository.fullName}</strong><small>{repository.defaultBranch || "default branch unavailable"}</small></span>
                          <Badge tone={repository.archived || repository.disabled ? "warning" : "neutral"}>{repository.private ? "Private" : "Public"}</Badge>
                        </a>
                      )) : <p className={styles.repositoryEmpty}>No repositories are currently available to this installation.</p>}
                    </div>
                    {canManageGitHub ? (
                      <div className={styles.actions}>
                        <Button tone="secondary" type="button" disabled={githubBusy === installation.installationId} onClick={() => void refreshInstallation(installation.installationId)}>{githubBusy === installation.installationId ? "Refreshing…" : "Refresh repositories"}</Button>
                        {installation.installationUrl ? <a className={styles.secondaryLink} href={installation.installationUrl} target="_blank" rel="noreferrer">Manage on GitHub ↗</a> : null}
                        <Button tone="danger" type="button" disabled={githubBusy === installation.installationId} onClick={() => void disconnectInstallation(installation.installationId)}>Disconnect from scope</Button>
                      </div>
                    ) : null}
                  </section>
                ))}
                {canManageGitHub ? <ButtonLink href="/api/github/install/start?returnTo=/dashboard/integrations" tone="secondary">Connect another installation</ButtonLink> : null}
              </div>
            )}
          </div>

          <div className={styles.column}>
            <p className={styles.label}>Platform readiness</p>
            <div className={styles.configRow}><span>GitHub App registration</span><strong className={!github.appConfigured ? styles.missing : undefined}>{github.appConfigured ? github.appSlug ?? "Configured" : "Operator setup required"}</strong></div>
            <div className={styles.configRow}><span>Durable installation metadata</span><strong className={!github.persistenceConfigured ? styles.missing : undefined}>{github.persistenceConfigured ? "Configured" : "Not configured"}</strong></div>
            <div className={styles.configRow}><span>SERV contextual reasoning</span><strong className={!github.servConfigured ? styles.missing : undefined}>{github.servConfigured ? "Configured" : "Missing"}</strong></div>
            <div className={styles.configRow}><span>Current scope</span><strong>{activeInstallations.length ? "Connected" : "No installation"}</strong></div>
            <Notice tone="info" title="Credential boundary">VetoLayer stores installation and repository metadata only. GitHub user authorization tokens are discarded after setup, and installation tokens are minted on demand and never returned to the browser.</Notice>
          </div>
        </div>

        {selectedInstallation?.status === "active" && selectedInstallation.repositories.length ? (
          <div className={styles.liveEvaluation}>
            <div className={styles.liveEvaluationIntro}>
              <p className={styles.label}>Live evidence check</p>
              <h3>Evaluate a real pull request</h3>
              <p>This calls the existing GitHub gate with a short-lived installation token, collects current repository evidence, runs policy + SERV reasoning, and persists the resulting Decision Receipt.</p>
            </div>
            <form className={styles.evaluationForm} onSubmit={evaluatePullRequest}>
              {installations.filter((item) => item.status === "active").length > 1 ? <Field label="GitHub installation"><Select value={selectedInstallation.installationId} onChange={(event) => setSelectedInstallationId(Number(event.target.value))}>{installations.filter((item) => item.status === "active").map((item) => <option key={item.installationId} value={item.installationId}>{item.accountLogin}</option>)}</Select></Field> : null}
              <Field label="Repository"><Select value={selectedRepository} onChange={(event) => setSelectedRepository(event.target.value)}>{selectedInstallation.repositories.map((repository) => <option key={repository.id} value={repository.fullName}>{repository.fullName}</option>)}</Select></Field>
              <Field label="Pull request number"><Input type="number" min={1} inputMode="numeric" value={pullRequest} onChange={(event) => setPullRequest(event.target.value)} placeholder="42" required /></Field>
              <Field label="Protected action"><Select value={operation} onChange={(event) => setOperation(event.target.value)}><option value="merge-pull-request">Merge pull request</option><option value="deploy-production">Deploy production</option><option value="modify-protected-configuration">Modify protected configuration</option><option value="security-sensitive-change">Security-sensitive change</option></Select></Field>
              <Button tone="primary" type="submit" disabled={githubBusy === "evaluation"}>{githubBusy === "evaluation" ? "Evaluating…" : "Run VetoLayer evaluation"}</Button>
            </form>
            {evaluation ? (
              <div className={styles.evaluationResult}>
                <div><OutcomeBadge outcome={evaluation.receipt.outcome} /><strong>{evaluation.snapshot.repository} #{evaluation.snapshot.pullRequest}</strong></div>
                <p>{evaluation.receipt.decisionSummary}</p>
                <small>{evaluation.snapshot.changedFiles} changed files · {evaluation.snapshot.reviews} reviews · {evaluation.snapshot.checks} check runs</small>
                <div className={styles.actions}><Link className={styles.secondaryLink} href={`/dashboard/decisions/${encodeURIComponent(evaluation.receipt.receiptId)}`}>Open Decision Receipt →</Link><a className={styles.secondaryLink} href={evaluation.snapshot.url} target="_blank" rel="noreferrer">Open pull request ↗</a></div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.identity}>
            <div className={styles.icon}>API</div>
            <div>
              <h2>Developer API + SDK</h2>
              <p>Put the same VetoLayer decision boundary in front of any agent or high-impact tool call without adopting another agent framework.</p>
              <span className={styles.endpoint}>POST {developerApi.endpoint}</span>
            </div>
          </div>
          <Badge tone={developerApi.ready ? "success" : developerApi.state === "local-only" ? "info" : "warning"}>{developerApi.state === "ready" ? "Ready" : developerApi.state === "local-only" ? "Local / demo" : "Needs setup"}</Badge>
        </div>

        <div className={styles.body}>
          <div className={styles.column}>
            <p className={styles.label}>Server-side TypeScript client</p>
            <pre className={styles.code}>{sdkSnippet}</pre>
            <div className={styles.actions}>
              <Button tone="secondary" type="button" onClick={() => void testDeveloperApi()} disabled={testingApi}>{testingApi ? "Testing…" : "Test API configuration"}</Button>
              <Link className={styles.secondaryLink} href="/dashboard/decisions">Inspect decisions →</Link>
            </div>
            <TestResult result={apiResult} />
          </div>
          <div className={styles.column}>
            <p className={styles.label}>Configuration status</p>
            <div className={styles.configRow}><span>Evaluation endpoint</span><strong>{developerApi.endpoint}</strong></div>
            <div className={styles.configRow}><span>Bearer authentication</span><strong className={!developerApi.authConfigured ? styles.missing : undefined}>{developerApi.authConfigured ? "Enabled" : "Not configured"}</strong></div>
            <div className={styles.configRow}><span>Production readiness</span><strong>{developerApi.ready ? "Ready" : "Needs API key"}</strong></div>
            {developerApi.missing.length > 0 ? <Notice tone="warning" title="Required next">Set {developerApi.missing.join(" and ")} server-side before exposing the Developer API publicly.</Notice> : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

function TestResult({ result }: { result?: IntegrationTestResult }) {
  if (!result) return null;
  const tone = result.level === "success" ? "success" : result.level === "warning" ? "warning" : "danger";
  return (
    <div aria-live="polite" className={styles.testResult}>
      <Notice tone={tone} title={result.code.replaceAll("_", " ")}>{result.message}</Notice>
      {result.details?.account ? <small className={styles.testMeta}>Connected GitHub account: {result.details.account}</small> : null}
      {result.details?.auth ? <small className={styles.testMeta}>Bearer authentication: {result.details.auth}</small> : null}
      {result.nextSteps?.length ? <ul className={styles.nextSteps}>{result.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul> : null}
    </div>
  );
}

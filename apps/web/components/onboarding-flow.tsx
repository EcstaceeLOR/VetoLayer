"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  OnboardingIntegrationChoice,
  OnboardingSnapshot,
  OnboardingUseCase,
} from "../lib/onboarding-model";
import { onboardingStepLabels, onboardingUseCases } from "../lib/onboarding-model";
import { onboardingPolicyPackNames } from "../lib/onboarding-policies";
import { ArrowRightIcon } from "./ui/icons";
import { Badge, Button, ButtonLink, Card, Field, Input, Notice, Select } from "./ui/primitives";

type ApiError = { code?: string; message?: string };
type ApiEnvelope = {
  error?: ApiError;
  snapshot?: OnboardingSnapshot;
  workspace?: { id: string; name: string };
  project?: { id: string; name: string };
  currentEnvironment?: { id: string; name: string };
  defaultEnvironment?: { id: string; name: string };
  environment?: { id: string; name: string };
  result?: {
    ok: boolean;
    level: "success" | "warning" | "error";
    code: string;
    message: string;
    nextSteps?: string[];
  };
  receipt?: {
    receiptId: string;
    outcome: "ALLOW" | "REVIEW" | "BLOCK";
    decisionSummary: string;
  };
};

type NoticeState = {
  tone: "success" | "warning" | "danger" | "info";
  title: string;
  message: string;
  nextSteps?: string[];
};

function noticeBody(notice: NoticeState) {
  if (!notice.nextSteps?.length) return notice.message;
  return `${notice.message} Next: ${notice.nextSteps.join(" ")}`;
}

export function OnboardingFlow({ initialSnapshot }: { initialSnapshot: OnboardingSnapshot }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [step, setStep] = useState(initialSnapshot.complete ? 8 : initialSnapshot.resumeStep);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [projectId, setProjectId] = useState(initialSnapshot.state.projectId ?? initialSnapshot.selected?.project.id ?? "");
  const [environmentId, setEnvironmentId] = useState(initialSnapshot.state.environmentId ?? initialSnapshot.selected?.environment.id ?? "");
  const [useCase, setUseCase] = useState<OnboardingUseCase>(initialSnapshot.state.useCase ?? "coding");
  const [integration, setIntegration] = useState<OnboardingIntegrationChoice>(initialSnapshot.state.integrationChoice ?? "developer-api");
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>(initialSnapshot.state.policyIds ?? []);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    setProjectId(snapshot.state.projectId ?? snapshot.selected?.project.id ?? "");
    setEnvironmentId(snapshot.state.environmentId ?? snapshot.selected?.environment.id ?? "");
    setUseCase(snapshot.state.useCase ?? "coding");
    setIntegration(snapshot.state.integrationChoice ?? "developer-api");
    setSelectedPolicyIds(snapshot.state.policyIds ?? []);
  }, [snapshot]);

  const completedCount = snapshot.steps.filter((item) => item.complete).length;
  const selectedUseCase = onboardingUseCases.find((item) => item.id === useCase) ?? onboardingUseCases[0]!;
  const currentConnection = snapshot.connections.find((item) => item.integration === integration);
  const blockers = snapshot.steps.filter((item) => item.id >= 4 && item.id <= 6 && !item.complete);
  const canManageProjects = snapshot.selected?.role === "owner" || snapshot.selected?.role === "admin";

  async function jsonRequest(path: string, init?: RequestInit): Promise<ApiEnvelope> {
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({})) as ApiEnvelope;
    if (!response.ok) throw new Error(data.error?.message ?? "VetoLayer could not complete that setup action.");
    return data;
  }

  function applySnapshot(next?: OnboardingSnapshot) {
    if (next) setSnapshot(next);
  }

  async function saveState(payload: Record<string, unknown>) {
    const data = await jsonRequest("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    applySnapshot(data.snapshot);
    return data.snapshot;
  }

  async function rememberStep(nextStep: number) {
    setStep(nextStep);
    try {
      await saveState({ lastStep: nextStep });
    } catch {
      // The visible wizard may continue, but completion is always revalidated server-side.
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (workspaceName.trim().length < 2 || projectName.trim().length < 2) return;
    setBusy("workspace-create");
    setNotice(null);
    try {
      const created = await jsonRequest("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceName: workspaceName.trim(), projectName: projectName.trim() }),
      });
      if (!created.workspace || !created.project || !created.currentEnvironment) throw new Error("Workspace creation returned incomplete context.");
      await saveState({
        workspaceId: created.workspace.id,
        projectId: created.project.id,
        environmentId: created.currentEnvironment.id,
        lastStep: 2,
      });
      setNotice({ tone: "success", title: "Workspace created", message: `${created.workspace.name} is ready with its first project and environments.` });
      setStep(2);
      router.refresh();
    } catch (error) {
      setNotice({ tone: "danger", title: "Workspace setup failed", message: error instanceof Error ? error.message : "Workspace setup failed." });
    } finally {
      setBusy(null);
    }
  }

  async function selectWorkspace(workspaceId: string) {
    setBusy(`workspace-${workspaceId}`);
    setNotice(null);
    try {
      const context = await jsonRequest("/api/workspaces/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!context.workspace || !context.project || !context.environment) throw new Error("Workspace context could not be resolved.");
      await saveState({
        workspaceId: context.workspace.id,
        projectId: context.project.id,
        environmentId: context.environment.id,
        lastStep: 2,
      });
      setStep(2);
      router.refresh();
    } catch (error) {
      setNotice({ tone: "danger", title: "Workspace selection failed", message: error instanceof Error ? error.message : "Workspace selection failed." });
    } finally {
      setBusy(null);
    }
  }

  async function chooseProject(nextProjectId: string) {
    if (!snapshot.selected) return;
    setBusy(`project-${nextProjectId}`);
    setNotice(null);
    try {
      const context = await jsonRequest("/api/workspaces/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: snapshot.selected.workspace.id, projectId: nextProjectId }),
      });
      if (!context.project || !context.environment) throw new Error("Project context could not be resolved.");
      await saveState({ projectId: context.project.id, environmentId: context.environment.id, lastStep: 3 });
      setStep(3);
      router.refresh();
    } catch (error) {
      setNotice({ tone: "danger", title: "Project selection failed", message: error instanceof Error ? error.message : "Project selection failed." });
    } finally {
      setBusy(null);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newProjectName.trim().length < 2) return;
    setBusy("project-create");
    setNotice(null);
    try {
      const created = await jsonRequest("/api/workspaces/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (!created.project || !created.defaultEnvironment) throw new Error("Project creation returned incomplete context.");
      await saveState({ projectId: created.project.id, environmentId: created.defaultEnvironment.id, lastStep: 3 });
      setNewProjectName("");
      setNotice({ tone: "success", title: "Project created", message: `${created.project.name} is ready with Development, Staging, and Production environments.` });
      setStep(3);
      router.refresh();
    } catch (error) {
      setNotice({ tone: "danger", title: "Project setup failed", message: error instanceof Error ? error.message : "Project setup failed." });
    } finally {
      setBusy(null);
    }
  }

  async function confirmEnvironment() {
    if (!snapshot.selected || !environmentId) return;
    setBusy("environment");
    setNotice(null);
    try {
      const context = await jsonRequest("/api/workspaces/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: snapshot.selected.workspace.id,
          projectId: snapshot.selected.project.id,
          environmentId,
        }),
      });
      if (!context.environment) throw new Error("Environment context could not be resolved.");
      await saveState({ environmentId: context.environment.id, useCase, lastStep: 4 });
      setStep(4);
      router.refresh();
    } catch (error) {
      setNotice({ tone: "danger", title: "Environment setup failed", message: error instanceof Error ? error.message : "Environment setup failed." });
    } finally {
      setBusy(null);
    }
  }

  async function verifyIntegration(choice: OnboardingIntegrationChoice) {
    setBusy(`integration-${choice}`);
    setNotice(null);
    setIntegration(choice);
    try {
      const response = await jsonRequest("/api/integrations/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integration: choice }),
      });
      const next = await saveState({ integrationChoice: choice, lastStep: response.result?.ok ? 5 : 4 });
      const result = response.result;
      if (!result) throw new Error("Integration verification did not return a result.");
      setNotice({
        tone: result.ok ? (result.level === "warning" ? "warning" : "success") : "danger",
        title: result.ok ? "Integration verified" : "Integration needs attention",
        message: result.message,
        nextSteps: result.nextSteps,
      });
      if (result.ok && next?.steps.find((item) => item.id === 4)?.complete) setStep(5);
    } catch (error) {
      setNotice({ tone: "danger", title: "Integration test failed", message: error instanceof Error ? error.message : "Integration verification failed." });
    } finally {
      setBusy(null);
    }
  }

  async function installStarterPolicies() {
    setBusy("policy-starter");
    setNotice(null);
    try {
      const data = await jsonRequest("/api/onboarding/policy-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install-starter" }),
      });
      applySnapshot(data.snapshot);
      setNotice({ tone: "success", title: "Policy pack installed", message: `${onboardingPolicyPackNames[useCase]} is now persisted in this project and environment.` });
      setStep(6);
    } catch (error) {
      setNotice({ tone: "danger", title: "Policy setup failed", message: error instanceof Error ? error.message : "Policy setup failed." });
    } finally {
      setBusy(null);
    }
  }

  async function useExistingPolicies() {
    if (!selectedPolicyIds.length) return;
    setBusy("policy-existing");
    setNotice(null);
    try {
      const data = await jsonRequest("/api/onboarding/policy-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select-existing", policyIds: selectedPolicyIds }),
      });
      applySnapshot(data.snapshot);
      setNotice({ tone: "success", title: "Policies selected", message: `${selectedPolicyIds.length} persisted policies will govern the onboarding test.` });
      setStep(6);
    } catch (error) {
      setNotice({ tone: "danger", title: "Policy selection failed", message: error instanceof Error ? error.message : "Policy selection failed." });
    } finally {
      setBusy(null);
    }
  }

  async function recheckServ() {
    setBusy("serv-check");
    setNotice(null);
    try {
      const data = await jsonRequest("/api/onboarding", { cache: "no-store" });
      applySnapshot(data.snapshot);
      if (data.snapshot?.serv.configured) {
        await saveState({ lastStep: 7 });
        setNotice({ tone: "success", title: "SERV ready", message: "Contextual reasoning configuration is present. The next action will verify the live provider path." });
        setStep(7);
      } else {
        setNotice({ tone: "warning", title: "SERV still needs configuration", message: data.snapshot?.serv.message ?? "Configure SERV before running the test action." });
      }
    } catch (error) {
      setNotice({ tone: "danger", title: "Readiness check failed", message: error instanceof Error ? error.message : "SERV readiness could not be checked." });
    } finally {
      setBusy(null);
    }
  }

  async function runTestAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (target.trim().length < 2 || reason.trim().length < 8) return;
    setBusy("test-action");
    setNotice(null);
    try {
      const response = await fetch("/api/onboarding/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: target.trim(), reason: reason.trim() }),
      });
      const data = await response.json().catch(() => ({})) as ApiEnvelope;
      if (!response.ok) {
        setNotice({
          tone: "danger",
          title: data.error?.code === "SERV_LIVE_CHECK_FAILED" ? "SERV live verification failed" : "Test action failed",
          message: data.error?.message ?? "The onboarding test could not be completed.",
          nextSteps: data.error?.code === "SERV_LIVE_CHECK_FAILED"
            ? ["Verify SERV_API_KEY and SERV_MODEL in the deployment environment.", "Confirm the configured SERV model is available to the key.", "Redeploy and retry this action."]
            : undefined,
        });
        return;
      }
      applySnapshot(data.snapshot);
      setNotice({ tone: "success", title: "Real decision created", message: `VetoLayer evaluated the action and produced a ${data.receipt?.outcome ?? "completed"} Decision Receipt through live SERV reasoning.` });
      setStep(8);
      router.refresh();
    } catch (error) {
      setNotice({ tone: "danger", title: "Test action failed", message: error instanceof Error ? error.message : "The onboarding test could not be completed." });
    } finally {
      setBusy(null);
    }
  }

  async function restart() {
    if (!window.confirm("Restart onboarding? Existing workspaces, policies, integrations, and decision history will be preserved; only the setup resume state is cleared.")) return;
    setBusy("restart");
    setNotice(null);
    try {
      const data = await jsonRequest("/api/onboarding", { method: "DELETE" });
      applySnapshot(data.snapshot);
      setWorkspaceName("");
      setProjectName("");
      setNewProjectName("");
      setTarget("");
      setReason("");
      setStep(1);
      setNotice({ tone: "info", title: "Setup restarted", message: "Existing product resources were preserved. You can select them again or create new ones." });
    } catch (error) {
      setNotice({ tone: "danger", title: "Restart failed", message: error instanceof Error ? error.message : "Onboarding could not be restarted." });
    } finally {
      setBusy(null);
    }
  }

  function togglePolicy(id: string) {
    setSelectedPolicyIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function skipForNow(nextStep: number, requirement: string) {
    setNotice({ tone: "warning", title: "Skipped for now", message: `${requirement} remains incomplete. You can keep exploring setup, but VetoLayer will not mark onboarding complete or run the final gate until you resolve it.` });
    void rememberStep(nextStep);
  }

  return (
    <div className="onboardingOperationalLayout">
      <aside className="onboardingProgressRail" aria-label="Setup progress">
        <div className="onboardingProgressSummary">
          <p className="vlEyebrow">Operational setup</p>
          <h1>Build your first working gate.</h1>
          <p>{completedCount} of 8 checkpoints validated against real product state.</p>
          <div className="onboardingProgressMeter" aria-label={`${completedCount} of 8 onboarding checkpoints complete`}>
            <span style={{ width: `${(completedCount / 8) * 100}%` }} />
          </div>
          <div className="onboardingDurability">
            <Badge tone={snapshot.durable ? "success" : "warning"}>{snapshot.durable ? "Durable progress" : "Local-only progress"}</Badge>
            {snapshot.complete ? <Badge tone="accent">Operational</Badge> : null}
          </div>
        </div>

        <ol className="onboardingStepList">
          {snapshot.steps.map((item) => (
            <li key={item.id}>
              <button type="button" className={step === item.id ? "active" : ""} onClick={() => setStep(item.id)} aria-current={step === item.id ? "step" : undefined}>
                <span className={item.complete ? "complete" : "pending"}>{item.complete ? "✓" : String(item.id).padStart(2, "0")}</span>
                <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              </button>
            </li>
          ))}
        </ol>

        <div className="onboardingRailFooter">
          <Button tone="ghost" size="sm" onClick={() => void restart()} disabled={Boolean(busy)}>Restart setup</Button>
          <small>Restarting never deletes product resources or decision history.</small>
        </div>
      </aside>

      <section className="onboardingWorkArea">
        <div className="onboardingWorkHeader">
          <div><span>Step {step} of 8</span><strong>{onboardingStepLabels[step - 1]}</strong></div>
          {snapshot.selected ? (
            <div className="onboardingScopeChip">
              <span>{snapshot.selected.workspace.name}</span><b>/</b>
              <span>{snapshot.selected.project.name}</span><b>/</b>
              <span>{snapshot.selected.environment.name}</span>
            </div>
          ) : null}
        </div>

        {notice ? <Notice tone={notice.tone} title={notice.title} role={notice.tone === "danger" ? "alert" : "status"}>{noticeBody(notice)}</Notice> : null}

        {step === 1 ? (
          <Card raised className="onboardingOperationalCard">
            <p className="vlEyebrow">Organization boundary</p>
            <h2>Create or select the team that owns these decisions.</h2>
            <p className="muted">Workspace membership is the authorization boundary for every policy, review, integration, and receipt. Existing workspaces are reused; nothing is copied into a example namespace.</p>
            {snapshot.workspaces.length ? (
              <div className="onboardingResourceList">
                {snapshot.workspaces.map(({ workspace, role }) => (
                  <button key={workspace.id} type="button" className={snapshot.selected?.workspace.id === workspace.id ? "selected" : ""} onClick={() => void selectWorkspace(workspace.id)} disabled={Boolean(busy)}>
                    <span><strong>{workspace.name}</strong><small>{workspace.id}</small></span>
                    <Badge tone={role === "owner" ? "accent" : "neutral"}>{role}</Badge>
                  </button>
                ))}
              </div>
            ) : <Notice tone="info" title="No workspace yet">Create your first workspace below. You become its Owner automatically.</Notice>}
            <div className="onboardingDivider"><span>or create a workspace</span></div>
            <form className="onboardingFormGrid" onSubmit={(event) => void createWorkspace(event)}>
              <Field label="Workspace name" hint="Your organization or team boundary."><Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Platform Engineering" required minLength={2} /></Field>
              <Field label="Initial project" hint="Workspace creation includes one real project so the organization is immediately usable. You can select or create another in Step 2."><Input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Agent Control Plane" required minLength={2} /></Field>
              <Button type="submit" tone="primary" size="lg" disabled={Boolean(busy) || workspaceName.trim().length < 2 || projectName.trim().length < 2}>{busy === "workspace-create" ? "Creating…" : "Create workspace"} {busy !== "workspace-create" ? <ArrowRightIcon /> : null}</Button>
            </form>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card raised className="onboardingOperationalCard">
            <p className="vlEyebrow">Project boundary</p>
            <h2>Choose the product or agent system VetoLayer will govern.</h2>
            {!snapshot.selected ? <Notice tone="warning" title="Workspace required">Complete Step 1 before configuring a project.</Notice> : (
              <>
                <Field label="Active project"><Select value={projectId || snapshot.selected.project.id} onChange={(event) => setProjectId(event.target.value)}>{snapshot.selected.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field>
                <div className="onboardingActions"><Button tone="primary" onClick={() => void chooseProject(projectId || snapshot.selected!.project.id)} disabled={Boolean(busy)}>Use selected project <ArrowRightIcon /></Button><Link href="/dashboard/workspace">Manage projects</Link></div>
                {canManageProjects ? (
                  <><div className="onboardingDivider"><span>or create another project</span></div><form className="onboardingInlineForm" onSubmit={(event) => void createProject(event)}><Field label="Project name"><Input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Payments Agent" required minLength={2} /></Field><Button type="submit" tone="secondary" disabled={Boolean(busy) || newProjectName.trim().length < 2}>{busy === "project-create" ? "Creating…" : "Create project"}</Button></form></>
                ) : <Notice tone="info" title="Project creation is admin-managed">Your {snapshot.selected.role} role can use existing projects but cannot create new ones.</Notice>}
              </>
            )}
          </Card>
        ) : null}

        {step === 3 ? (
          <Card raised className="onboardingOperationalCard">
            <p className="vlEyebrow">Operating context</p>
            <h2>Choose where the gate runs and what kind of action it protects.</h2>
            {!snapshot.selected ? <Notice tone="warning" title="Project required">Choose a workspace and project first.</Notice> : (
              <>
                <Field label="Target environment" hint="Policies, integrations, decisions, and receipts stay scoped to this environment."><Select value={environmentId || snapshot.selected.environment.id} onChange={(event) => setEnvironmentId(event.target.value)}>{snapshot.selected.environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name} · {environment.kind}</option>)}</Select></Field>
                <div className="onboardingUseCaseGrid">{onboardingUseCases.map((item) => <button key={item.id} type="button" className={useCase === item.id ? "selected" : ""} onClick={() => setUseCase(item.id)}><span>{item.recommended ? "Recommended" : "Use case"}</span><strong>{item.title}</strong><p>{item.description}</p></button>)}</div>
                <div className="onboardingActions"><Button tone="ghost" onClick={() => setStep(2)}>← Back</Button><Button tone="primary" size="lg" onClick={() => void confirmEnvironment()} disabled={Boolean(busy) || !environmentId}>Save operating context <ArrowRightIcon /></Button></div>
              </>
            )}
          </Card>
        ) : null}

        {step === 4 ? (
          <Card raised className="onboardingOperationalCard">
            <p className="vlEyebrow">Execution path</p>
            <h2>Connect the path your agents will use to ask VetoLayer for a decision.</h2>
            <div className="onboardingIntegrationGrid">
              <button type="button" className={integration === "developer-api" ? "selected" : ""} onClick={() => setIntegration("developer-api")}><span>Developer API</span><strong>Provider-agnostic gate</strong><p>Call VetoLayer before any high-impact tool invocation. Production requires bearer authentication.</p>{snapshot.connections.find((item) => item.integration === "developer-api") ? <Badge tone="success">Previously tested</Badge> : null}</button>
              <button type="button" className={integration === "github" ? "selected" : ""} onClick={() => setIntegration("github")}><span>GitHub</span><strong>Coding-agent gate</strong><p>Verify the currently configured GitHub server connection for repository evidence and action gating.</p>{snapshot.connections.find((item) => item.integration === "github") ? <Badge tone="success">Previously tested</Badge> : null}</button>
            </div>
            {currentConnection ? <Notice tone={currentConnection.state === "ready" ? "success" : currentConnection.state === "warning" ? "warning" : "danger"} title="Stored connection status">{integration} is currently {currentConnection.state}{currentConnection.account ? ` as ${currentConnection.account}` : ""}.</Notice> : null}
            <div className="onboardingActions onboardingActionsSpread"><Button tone="ghost" onClick={() => skipForNow(5, "Integration verification")}>Skip for now</Button><div><Link href="/dashboard/integrations">Advanced integration setup</Link><Button tone="primary" size="lg" onClick={() => void verifyIntegration(integration)} disabled={Boolean(busy)}>{busy?.startsWith("integration-") ? "Testing…" : `Verify ${integration === "github" ? "GitHub" : "Developer API"}`} <ArrowRightIcon /></Button></div></div>
          </Card>
        ) : null}

        {step === 5 ? (
          <Card raised className="onboardingOperationalCard">
            <p className="vlEyebrow">Policy pack</p>
            <h2>Persist the rules that will govern your first action.</h2>
            <p className="muted">The recommended pack includes deterministic enforcement plus a contextual policy so the setup test proves the live SERV reasoning path.</p>
            <div className="onboardingPolicyStarter"><div><span>Recommended for {selectedUseCase.title}</span><strong>{onboardingPolicyPackNames[useCase]}</strong><p>Creates real scoped policies in Policy Studio. They remain editable after onboarding.</p></div><Button tone="primary" onClick={() => void installStarterPolicies()} disabled={Boolean(busy)}>{busy === "policy-starter" ? "Installing…" : "Install recommended pack"}</Button></div>
            {snapshot.policies.length ? <><div className="onboardingDivider"><span>or use existing persisted policies</span></div><div className="onboardingPolicyList">{snapshot.policies.map((policy) => <label key={policy.id}><input type="checkbox" checked={selectedPolicyIds.includes(policy.id)} onChange={() => togglePolicy(policy.id)} /><span><strong>{policy.name}</strong><small>{policy.mode} · {policy.severity}</small></span></label>)}</div><Button tone="secondary" onClick={() => void useExistingPolicies()} disabled={Boolean(busy) || !selectedPolicyIds.length}>Use selected policies</Button></> : null}
            <div className="onboardingActions onboardingActionsSpread"><Button tone="ghost" onClick={() => skipForNow(6, "A persisted policy pack")}>Skip for now</Button><Link href="/dashboard/policies">Open Policy Studio</Link></div>
          </Card>
        ) : null}

        {step === 6 ? (
          <Card raised className="onboardingOperationalCard">
            <p className="vlEyebrow">Contextual reasoning</p>
            <h2>Verify that SERV is available before the first live gate.</h2>
            <div className={`onboardingReadiness ${snapshot.serv.configured ? "ready" : "blocked"}`}><div><span className="onboardingReadinessDot" /><strong>{snapshot.serv.configured ? "SERV configuration detected" : "SERV configuration missing"}</strong></div><p>{snapshot.serv.message}</p><dl><div><dt>API key</dt><dd>{snapshot.serv.configured ? "Configured" : "Required"}</dd></div><div><dt>Model</dt><dd>{snapshot.serv.modelConfigured ? "Configured" : "Required"}</dd></div></dl></div>
            {!snapshot.serv.configured ? <Notice tone="warning" title="Action required">Set SERV_API_KEY and SERV_MODEL in the deployment environment, redeploy VetoLayer, then use Recheck. Secret values are never returned to this page.</Notice> : <Notice tone="info" title="Two-stage verification">This step verifies configuration presence. The test action in Step 7 only completes if SERV also returns a validated live reasoning response.</Notice>}
            <div className="onboardingActions onboardingActionsSpread"><Button tone="ghost" onClick={() => skipForNow(7, "SERV readiness")}>Skip for now</Button><Button tone="primary" size="lg" onClick={() => void recheckServ()} disabled={Boolean(busy)}>{busy === "serv-check" ? "Checking…" : "Recheck SERV"} <ArrowRightIcon /></Button></div>
          </Card>
        ) : null}

        {step === 7 ? (
          <Card raised className="onboardingOperationalCard">
            <p className="vlEyebrow">Real evaluation</p>
            <h2>Send one action through the actual VetoLayer decision pipeline.</h2>
            <p className="muted">This does not execute an external tool action. It does run the real deterministic evaluator, live SERV contextual reasoning, receipt hashing, and decision persistence in your selected scope.</p>
            {blockers.length ? <Notice tone="warning" title="Resolve setup blockers first">{blockers.map((item) => `${item.label}: ${item.detail}`).join(" ")}</Notice> : null}
            <form className="onboardingFormGrid" onSubmit={(event) => void runTestAction(event)}>
              <Field label={useCase === "coding" ? "Target repository/service" : useCase === "support" ? "Customer/account target" : "Vendor/payment target"}><Input value={target} onChange={(event) => setTarget(event.target.value)} placeholder={useCase === "coding" ? "identity-api" : useCase === "support" ? "customer-1042" : "vendor-northstar"} required minLength={2} /></Field>
              <Field label="Why should the agent take this action?" hint="This context is sent to the bounded policy evaluation as untrusted action data."><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={useCase === "coding" ? "Deploy the reviewed session-handling fix." : useCase === "support" ? "Issue a service credit after the documented outage." : "Pay the approved invoice for completed work."} required minLength={8} /></Field>
              <Button type="submit" tone="primary" size="lg" disabled={Boolean(busy) || blockers.length > 0 || target.trim().length < 2 || reason.trim().length < 8}>{busy === "test-action" ? "Evaluating through VetoLayer…" : "Run real test action"} {busy !== "test-action" ? <ArrowRightIcon /> : null}</Button>
            </form>
          </Card>
        ) : null}

        {step === 8 ? (
          <Card raised className="onboardingOperationalCard onboardingCompletionCard">
            <p className="vlEyebrow">Working gate created</p>
            {snapshot.receipt ? (
              <>
                <div className="onboardingReceiptHero"><div><Badge tone={snapshot.receipt.outcome === "ALLOW" ? "success" : snapshot.receipt.outcome === "BLOCK" ? "danger" : "warning"}>{snapshot.receipt.outcome}</Badge><h2>Your first Decision Receipt is real and persisted.</h2><p>{snapshot.receipt.summary}</p></div><span className="onboardingReceiptHash">{snapshot.receipt.receiptId}</span></div>
                <div className="onboardingCompletionLinks">
                  <Link href={snapshot.receipt.href}><strong>Inspect Decision Receipt</strong><span>Full findings, SERV trace, evidence, scope, and integrity hash →</span></Link>
                  <Link href={`/dashboard/policies${snapshot.state.policyIds?.[0] ? `?focus=${encodeURIComponent(snapshot.state.policyIds[0])}` : ""}`}><strong>Open policy pack</strong><span>Edit the policies that governed this action →</span></Link>
                  <Link href="/dashboard/integrations"><strong>Open integration</strong><span>Review connection status and developer setup →</span></Link>
                  <Link href="/dashboard/decisions"><strong>Decision stream</strong><span>See this receipt in its real project/environment history →</span></Link>
                </div>
                <div className="onboardingActions onboardingActionsSpread"><Button tone="ghost" onClick={() => setStep(7)}>Run another test</Button><ButtonLink tone="primary" size="lg" href="/dashboard">Enter Control Center <ArrowRightIcon /></ButtonLink></div>
              </>
            ) : (
              <><h2>No validated receipt yet.</h2><p className="muted">A seeded example receipt cannot complete onboarding. Run Step 7 successfully through live SERV reasoning to create a receipt in this workspace, project, and environment.</p><Button tone="primary" onClick={() => setStep(7)}>Return to test action</Button></>
            )}
          </Card>
        ) : null}
      </section>
    </div>
  );
}

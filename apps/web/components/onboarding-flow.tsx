"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "./ui/icons";
import { Button, Card, Field, Input, Notice } from "./ui/primitives";

type UseCase = "coding" | "support" | "finance";

const useCases: Array<{ id: UseCase; title: string; copy: string; recommended?: boolean }> = [
  { id: "coding", title: "Coding & deployment agents", copy: "Gate merges, production deploys, infra changes, and security-sensitive actions.", recommended: true },
  { id: "support", title: "Customer support agents", copy: "Control refunds, credits, cancellations, and contextual policy exceptions." },
  { id: "finance", title: "Finance & procurement agents", copy: "Evaluate payments, invoices, vendors, approvals, and evidence before execution." },
];

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [workspace, setWorkspace] = useState("");
  const [project, setProject] = useState("");
  const [useCase, setUseCase] = useState<UseCase>("coding");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => useCases.find((item) => item.id === useCase)!, [useCase]);
  const canContinue = workspace.trim().length > 1 && project.trim().length > 1;

  async function finish() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceName: workspace.trim(), projectName: project.trim(), useCase }),
      });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) {
        setError(result.error?.message ?? "VetoLayer could not create this workspace.");
        return;
      }
      router.push("/dashboard?welcome=1");
      router.refresh();
    } catch {
      setError("Workspace setup is temporarily unavailable. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="onboardingCard" raised>
      <div className="onboardingProgress" aria-label={`Onboarding step ${step} of 3`}>
        {[1, 2, 3].map((value) => <span key={value} className={value <= step ? "complete" : ""} />)}
      </div>

      {error ? <Notice tone="danger" title="Workspace setup failed">{error}</Notice> : null}

      {step === 1 ? (
        <section className="onboardingStep">
          <p className="vlEyebrow">Step 1 · Organization context</p>
          <h1>Name the workspace and first project your team will govern.</h1>
          <p className="muted">A workspace is the team boundary. Projects live inside it, and each project starts with Development, Staging, and Production environments so decisions and policies always have explicit operating context.</p>
          <Field label="Workspace name"><Input value={workspace} onChange={(event) => setWorkspace(event.target.value)} placeholder="Platform Engineering" autoFocus /></Field>
          <Field label="First project"><Input value={project} onChange={(event) => setProject(event.target.value)} placeholder="Agent Deployment Control" /></Field>
          <Button tone="primary" size="lg" disabled={!canContinue} onClick={() => setStep(2)}>Choose a use case <ArrowRightIcon /></Button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="onboardingStep">
          <p className="vlEyebrow">Step 2 · Initial policy pack</p>
          <h1>Start with the action that matters most.</h1>
          <p className="muted">VetoLayer stays horizontal. Your first use case only changes the guidance and integration path surfaced after workspace creation.</p>
          <div className="useCaseChooser">
            {useCases.map((item) => (
              <button key={item.id} type="button" className={useCase === item.id ? "useCaseChoice selected vlCard vlCardInteractive" : "useCaseChoice vlCard vlCardInteractive"} onClick={() => setUseCase(item.id)}>
                <span>{item.recommended ? "RECOMMENDED" : "POLICY PACK"}</span><strong>{item.title}</strong><p>{item.copy}</p><i>{useCase === item.id ? "Selected ✓" : "Select →"}</i>
              </button>
            ))}
          </div>
          <div className="onboardingActions"><Button tone="ghost" onClick={() => setStep(1)}>← Back</Button><Button tone="primary" size="lg" onClick={() => setStep(3)}>Review setup <ArrowRightIcon /></Button></div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="onboardingStep">
          <p className="vlEyebrow">Step 3 · Ready to create</p>
          <h1>Review your first governed product context.</h1>
          <div className="setupSummary">
            <div><span>Workspace</span><strong>{workspace}</strong></div>
            <div><span>Project</span><strong>{project}</strong></div>
            <div><span>Environments</span><strong>Development · Staging · Production</strong></div>
            <div><span>Your role</span><strong>Owner</strong></div>
            <div><span>Starter use case</span><strong>{selected.title}</strong></div>
            <div><span>Decision model</span><strong>Deterministic policy + SERV contextual judgment</strong></div>
          </div>
          <div className="nextStepsPanel"><span>WHAT HAPPENS NEXT</span><ol><li>Create or review project policies.</li><li>Connect an integration or Developer API.</li><li>Invite reviewers without giving them admin privileges.</li></ol></div>
          <div className="onboardingActions"><Button tone="ghost" onClick={() => setStep(2)} disabled={submitting}>← Back</Button><Button tone="primary" size="lg" onClick={finish} disabled={submitting}>{submitting ? "Creating workspace…" : "Enter control center"} {!submitting ? <ArrowRightIcon /> : null}</Button></div>
        </section>
      ) : null}
    </Card>
  );
}

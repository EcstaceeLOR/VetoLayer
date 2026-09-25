"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "./ui/icons";
import { Button, Card, Field, Input } from "./ui/primitives";

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

  const selected = useMemo(() => useCases.find((item) => item.id === useCase)!, [useCase]);
  const canContinue = workspace.trim().length > 1 && project.trim().length > 1;

  function finish() {
    const setup = { workspace: workspace.trim(), project: project.trim(), useCase, createdAt: new Date().toISOString() };
    localStorage.setItem("vetolayer:first-project", JSON.stringify(setup));
    router.push("/dashboard?welcome=1");
  }

  return (
    <Card className="onboardingCard" raised>
      <div className="onboardingProgress" aria-label={`Onboarding step ${step} of 3`}>
        {[1, 2, 3].map((value) => <span key={value} className={value <= step ? "complete" : ""} />)}
      </div>

      {step === 1 ? (
        <section className="onboardingStep">
          <p className="vlEyebrow">Step 1 · Your control surface</p>
          <h1>Name the workspace and project you want to govern.</h1>
          <p className="muted">Use names your team will recognize. This project becomes the context shown throughout the control center and is used to organize the policies, integrations, and decisions you configure next.</p>
          <Field label="Workspace name"><Input value={workspace} onChange={(event) => setWorkspace(event.target.value)} placeholder="Platform Engineering" autoFocus /></Field>
          <Field label="First project"><Input value={project} onChange={(event) => setProject(event.target.value)} placeholder="Production Deployments" /></Field>
          <Button tone="primary" size="lg" disabled={!canContinue} onClick={() => setStep(2)}>Choose a use case <ArrowRightIcon /></Button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="onboardingStep">
          <p className="vlEyebrow">Step 2 · Initial policy pack</p>
          <h1>Start with the action that matters most.</h1>
          <p className="muted">VetoLayer&apos;s core stays horizontal. Your first use case determines the starter policy guidance and the integration path we surface first.</p>
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
          <p className="vlEyebrow">Step 3 · Ready to configure</p>
          <h1>Review the context for your first VetoLayer project.</h1>
          <div className="setupSummary">
            <div><span>Workspace</span><strong>{workspace}</strong></div>
            <div><span>Project</span><strong>{project}</strong></div>
            <div><span>Starter use case</span><strong>{selected.title}</strong></div>
            <div><span>Decision model</span><strong>Deterministic policy + SERV contextual judgment</strong></div>
          </div>
          <div className="nextStepsPanel"><span>WHAT HAPPENS NEXT</span><ol><li>Create or review the starter policies.</li><li>Connect an integration or developer API.</li><li>Evaluate the first proposed agent action.</li></ol></div>
          <div className="onboardingActions"><Button tone="ghost" onClick={() => setStep(2)}>← Back</Button><Button tone="primary" size="lg" onClick={finish}>Enter control center <ArrowRightIcon /></Button></div>
        </section>
      ) : null}
    </Card>
  );
}

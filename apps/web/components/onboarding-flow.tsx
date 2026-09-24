"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type UseCase = "coding" | "support" | "finance";

const useCases: Array<{ id: UseCase; title: string; copy: string; recommended?: boolean }> = [
  { id: "coding", title: "Coding & deployment agents", copy: "Gate merges, production deploys, infra changes, and security-sensitive actions.", recommended: true },
  { id: "support", title: "Customer support agents", copy: "Control refunds, credits, cancellations, and contextual policy exceptions." },
  { id: "finance", title: "Finance & procurement agents", copy: "Evaluate payments, invoices, vendors, approvals, and evidence before execution." },
];

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [workspace, setWorkspace] = useState("Acme Engineering");
  const [project, setProject] = useState("Production Gate");
  const [useCase, setUseCase] = useState<UseCase>("coding");

  const selected = useMemo(() => useCases.find((item) => item.id === useCase)!, [useCase]);
  const canContinue = workspace.trim().length > 1 && project.trim().length > 1;

  function finish() {
    const setup = { workspace: workspace.trim(), project: project.trim(), useCase, createdAt: new Date().toISOString() };
    localStorage.setItem("vetolayer:first-project", JSON.stringify(setup));
    router.push("/dashboard?welcome=1");
  }

  return (
    <div className="onboardingCard">
      <div className="onboardingProgress" aria-label={`Onboarding step ${step} of 3`}>
        {[1, 2, 3].map((value) => <span key={value} className={value <= step ? "complete" : ""} />)}
      </div>

      {step === 1 ? (
        <section className="onboardingStep">
          <p className="eyebrow">STEP 1 · YOUR CONTROL SURFACE</p>
          <h1>Where will VetoLayer make decisions?</h1>
          <p className="muted">Create a lightweight workspace and first project. Authentication and durable ownership are added separately; this flow establishes the product model now.</p>
          <label className="fieldLabel">Workspace name<input value={workspace} onChange={(event) => setWorkspace(event.target.value)} placeholder="Acme Engineering" autoFocus /></label>
          <label className="fieldLabel">First project<input value={project} onChange={(event) => setProject(event.target.value)} placeholder="Production Gate" /></label>
          <button className="primaryButton buttonReset" disabled={!canContinue} onClick={() => setStep(2)}>Choose a use case →</button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="onboardingStep">
          <p className="eyebrow">STEP 2 · INITIAL POLICY PACK</p>
          <h1>Start with the action that matters most.</h1>
          <p className="muted">VetoLayer&apos;s core stays horizontal. Your first use case only determines the starter policy pack and onboarding guidance.</p>
          <div className="useCaseChooser">
            {useCases.map((item) => (
              <button key={item.id} type="button" className={useCase === item.id ? "useCaseChoice selected" : "useCaseChoice"} onClick={() => setUseCase(item.id)}>
                <span>{item.recommended ? "RECOMMENDED" : "POLICY PACK"}</span><strong>{item.title}</strong><p>{item.copy}</p><i>{useCase === item.id ? "Selected ✓" : "Select →"}</i>
              </button>
            ))}
          </div>
          <div className="onboardingActions"><button className="textButton" onClick={() => setStep(1)}>← Back</button><button className="primaryButton buttonReset" onClick={() => setStep(3)}>Review setup →</button></div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="onboardingStep">
          <p className="eyebrow">STEP 3 · READY TO GATE</p>
          <h1>Your first VetoLayer project is ready.</h1>
          <div className="setupSummary">
            <div><span>Workspace</span><strong>{workspace}</strong></div>
            <div><span>Project</span><strong>{project}</strong></div>
            <div><span>Starter use case</span><strong>{selected.title}</strong></div>
            <div><span>Decision model</span><strong>Deterministic policy + SERV contextual judgment</strong></div>
          </div>
          <div className="nextStepsPanel"><span>WHAT HAPPENS NEXT</span><ol><li>Create or review the starter policies.</li><li>Connect an integration or developer API.</li><li>Evaluate the first proposed agent action.</li></ol></div>
          <div className="onboardingActions"><button className="textButton" onClick={() => setStep(2)}>← Back</button><button className="primaryButton buttonReset" onClick={finish}>Enter control center →</button></div>
        </section>
      ) : null}
    </div>
  );
}

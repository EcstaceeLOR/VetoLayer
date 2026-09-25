import Link from "next/link";
import type { FirstRunGuide } from "../lib/first-run";
import { Badge, ButtonLink } from "./ui/primitives";

export function FirstRunChecklist({ guide }: { guide: FirstRunGuide }) {
  if (guide.complete) return null;

  return (
    <section className="firstRunPanel vlCard vlCardRaised" aria-labelledby="first-run-title">
      <div className="firstRunHeader">
        <div>
          <p className="vlEyebrow">Activation</p>
          <h2 id="first-run-title">Finish your first operational VetoLayer gate.</h2>
          <p>Policies, an execution path, and a real Decision Receipt are the minimum operational chain. You are {guide.completedCount}/3 core resources through activation.</p>
        </div>
        <ButtonLink className="firstRunDemo" tone="primary" href="/onboarding">
          <span>Resume guided setup →</span>
        </ButtonLink>
      </div>

      <div className="firstRunSteps">
        {guide.steps.map((step, index) => (
          <article className={step.complete ? "firstRunStep complete vlCard" : "firstRunStep vlCard"} key={step.id}>
            <div className="firstRunStepIndex">{step.complete ? "✓" : String(index + 1).padStart(2, "0")}</div>
            <div>
              <Badge tone={step.complete ? "success" : "neutral"}>{step.complete ? "Complete" : "Required"}</Badge>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <Link href={step.href}>{step.complete ? "Review setup" : step.cta} →</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

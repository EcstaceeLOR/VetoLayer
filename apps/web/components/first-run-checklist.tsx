import Link from "next/link";
import type { FirstRunGuide } from "../lib/first-run";
import { Badge, ButtonLink } from "./ui/primitives";

export function FirstRunChecklist({ guide }: { guide: FirstRunGuide }) {
  if (guide.complete) return null;

  return (
    <section className="firstRunPanel vlCard vlCardRaised" aria-labelledby="first-run-title">
      <div className="firstRunHeader">
        <div>
          <p className="vlEyebrow">First run</p>
          <h2 id="first-run-title">Get from workspace to first trusted decision.</h2>
          <p>VetoLayer becomes useful when policy, execution context, and auditable decisions are connected. You are {guide.completedCount}/3 steps through activation.</p>
        </div>
        <ButtonLink className="firstRunDemo" tone="secondary" href="/demo">
          <span>Run the 60-second flagship demo →</span>
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

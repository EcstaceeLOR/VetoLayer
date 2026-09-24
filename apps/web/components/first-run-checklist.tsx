import Link from "next/link";
import type { FirstRunGuide } from "../lib/first-run";

export function FirstRunChecklist({ guide }: { guide: FirstRunGuide }) {
  if (guide.complete) return null;

  return (
    <section className="firstRunPanel" aria-labelledby="first-run-title">
      <div className="firstRunHeader">
        <div>
          <p className="eyebrow">FIRST RUN</p>
          <h2 id="first-run-title">Get from workspace to first trusted decision.</h2>
          <p>VetoLayer becomes useful when policy, execution context, and auditable decisions are connected. You are {guide.completedCount}/3 steps through activation.</p>
        </div>
        <Link className="firstRunDemo" href="/demo">
          <span>Want the 60-second version?</span>
          <strong>Run the flagship demo →</strong>
          <small>Seeded scenario · real VetoLayer evaluation pipeline</small>
        </Link>
      </div>

      <div className="firstRunSteps">
        {guide.steps.map((step, index) => (
          <article className={step.complete ? "firstRunStep complete" : "firstRunStep"} key={step.id}>
            <div className="firstRunStepIndex">{step.complete ? "✓" : String(index + 1).padStart(2, "0")}</div>
            <div>
              <span>{step.complete ? "COMPLETE" : "REQUIRED"}</span>
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

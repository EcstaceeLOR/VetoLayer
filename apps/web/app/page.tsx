const steps = [
  "Agent proposes an action",
  "Hard policies run deterministically",
  "SERV reasons over context and exceptions when needed",
  "VetoLayer returns ALLOW, REVIEW, or BLOCK",
];

export default function HomePage() {
  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand"><span className="mark">V</span> VetoLayer</div>
        <span className="status"><span className="pulse" /> Architecture locked</span>
      </nav>

      <section className="hero">
        <p className="eyebrow">AI ACTION CONTROL LAYER</p>
        <h1>Reason before<br />the action is real.</h1>
        <p className="lede">
          VetoLayer sits between autonomous agents and high-impact tools, deciding whether an action should proceed given policy, evidence, and context.
        </p>
        <div className="decisionRow" aria-label="VetoLayer decision outcomes">
          <span className="pill allow">ALLOW</span>
          <span className="pill review">REVIEW</span>
          <span className="pill block">BLOCK</span>
        </div>
      </section>

      <section className="flow" aria-labelledby="flow-title">
        <div>
          <p className="eyebrow">THE CONTROL PATH</p>
          <h2 id="flow-title">Permission is not judgment.</h2>
          <p className="muted">Access control asks whether an agent can act. VetoLayer asks whether it should.</p>
        </div>
        <ol>
          {steps.map((step, index) => (
            <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}

const policies = [
  { id: "github-no-draft-actions", name: "Block actions on draft pull requests", mode: "Deterministic", severity: "Critical", description: "Stops autonomous merge or deployment while a pull request is still a draft." },
  { id: "github-ci-must-pass", name: "CI must pass before autonomous execution", mode: "Deterministic", severity: "Critical", description: "Escalates the action when current check runs are not successful." },
  { id: "github-review-required", name: "At least one human approval is required", mode: "Deterministic", severity: "High", description: "Requires a current approving review before execution." },
  { id: "github-sensitive-change-context", name: "Sensitive change contextual gate", mode: "SERV contextual", severity: "Critical", description: "Reasons over authentication, security, infrastructure, protected configuration, and deployment context when rigid rules are insufficient." },
];

export default function PoliciesPage() {
  return (
    <>
      <header className="dashboardHeader compactHeader">
        <div><p className="eyebrow">POLICY CONTROL</p><h1 className="dashboardTitle">Rules where certainty is possible. Reasoning where it isn’t.</h1><p className="dashboardIntro">VetoLayer keeps enforceable rules deterministic and sends only contextual judgment to SERV.</p></div>
      </header>
      <section className="dashboardSection">
        <div className="policyGrid">
          {policies.map((policy) => (
            <article className="policyCard" key={policy.id}>
              <div className="policyTop"><span className="modeTag">{policy.mode}</span><span className="severityTag">{policy.severity}</span></div>
              <h2>{policy.name}</h2>
              <p>{policy.description}</p>
              <div className="policyId mono">{policy.id}</div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

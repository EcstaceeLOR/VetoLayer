import Link from "next/link";

const controlPath = [
  ["01", "Agent proposes an action", "A merge, deployment, refund, purchase, or other high-impact tool call."],
  ["02", "Hard policy runs first", "Permissions, thresholds, required approvals, and explicit denies stay deterministic."],
  ["03", "SERV reasons where rules stop", "Context, evidence, exceptions, ambiguity, and conflicting signals are evaluated deliberately."],
  ["04", "Execution gets a verdict", "ALLOW, REVIEW, or BLOCK — with a tamper-evident Decision Receipt."],
] as const;

const useCases = [
  ["Coding agents", "Gate merges, production deploys, infrastructure changes, and security-sensitive actions."],
  ["Support agents", "Evaluate refunds, credits, cancellations, and policy exceptions before they reach customers."],
  ["Finance & procurement", "Reason over approvals, invoice evidence, vendor policy, and unusual exceptions before action."],
] as const;

export default function HomePage() {
  return (
    <main className="marketingShell">
      <nav className="marketingNav" aria-label="Main navigation">
        <Link href="/" className="brand"><span className="mark">V</span> VetoLayer</Link>
        <div className="marketingNavLinks">
          <Link href="/demo">Live demo</Link>
          <Link href="/dashboard">Control center</Link>
          <Link className="navCta" href="/onboarding">Start building</Link>
        </div>
      </nav>

      <section className="marketingHero">
        <div className="heroCopy">
          <div className="heroKicker"><span className="pulse" /> AI ACTION CONTROL LAYER</div>
          <h1>Agents can think freely.<br /><em>They should not act freely.</em></h1>
          <p className="heroLead">
            VetoLayer sits between autonomous agents and high-impact tools. It checks hard policy deterministically, uses SERV Reasoning for contextual judgment, and returns an auditable verdict before the action becomes real.
          </p>
          <div className="heroActions">
            <Link className="primaryButton" href="/onboarding">Create your first gate →</Link>
            <Link className="secondaryButton" href="/demo">Watch the flagship decision</Link>
          </div>
          <div className="decisionStrip" aria-label="Possible VetoLayer outcomes">
            <span className="decisionSignal allow"><b>ALLOW</b><small>safe to execute</small></span>
            <span className="decisionSignal review"><b>REVIEW</b><small>human judgment needed</small></span>
            <span className="decisionSignal block"><b>BLOCK</b><small>stop before execution</small></span>
          </div>
        </div>

        <div className="heroConsole" aria-label="Example VetoLayer decision">
          <div className="consoleTop"><span>LIVE DECISION</span><span className="consoleId">VT-2041</span></div>
          <div className="consoleAction">
            <small>PROPOSED ACTION</small>
            <strong>Deploy auth patch to production</strong>
            <span>Autonomous Coding Agent · identity-api</span>
          </div>
          <div className="consoleChecks">
            <div><span className="checkPass">✓</span><p><b>CI passed</b><small>3 required checks verified</small></p></div>
            <div><span className="checkPass">✓</span><p><b>Critical incident confirmed</b><small>INC-2041 · active exposure</small></p></div>
            <div><span className="checkWarn">!</span><p><b>Security approval missing</b><small>Contextual exception incomplete</small></p></div>
          </div>
          <div className="consoleVerdict"><span className="outcomeBadge review">REVIEW</span><p>SERV found the emergency exception plausible, but one required condition is unresolved.</p></div>
          <div className="consoleFooter"><span>SERV reasoning trace attached</span><span>Receipt integrity ✓</span></div>
        </div>
      </section>

      <section className="marketingProof">
        <div>
          <p className="eyebrow">THE PRODUCT THESIS</p>
          <h2>Permission answers <em>can</em>.<br />VetoLayer answers <em>should</em>.</h2>
        </div>
        <p>
          Traditional access control can tell you whether an agent has the right credential. It cannot reliably judge whether today&apos;s action makes sense given the evidence, policy exception, incident context, and unresolved risk. VetoLayer handles both layers without pretending every policy is an LLM problem.
        </p>
      </section>

      <section className="controlPathSection">
        <div className="sectionHeading marketingSectionHeading">
          <div><p className="eyebrow">CONTROL PATH</p><h2>One decision path. No hidden magic.</h2></div>
          <span className="sectionMeta">Hard rules + SERV contextual judgment</span>
        </div>
        <div className="controlPathGrid">
          {controlPath.map(([number, title, copy]) => (
            <article key={number} className="controlPathCard">
              <span>{number}</span><h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="marketSection">
        <div className="marketIntro">
          <p className="eyebrow">START NARROW. EXPAND NATURALLY.</p>
          <h2>Built first for coding agents. Designed for every high-impact action.</h2>
          <p>Our beachhead is developer security because the failure mode is immediate and measurable. The same decision contract later supports other policy packs without changing the core architecture.</p>
        </div>
        <div className="useCaseGrid">
          {useCases.map(([title, copy]) => <article key={title}><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className="finalCta">
        <div><p className="eyebrow">MAKE AUTONOMY EARN TRUST</p><h2>Put judgment between the agent and the action.</h2></div>
        <div className="heroActions"><Link className="primaryButton" href="/onboarding">Set up VetoLayer →</Link><Link className="secondaryButton" href="/demo">Open live demo</Link></div>
      </section>

      <footer className="marketingFooter"><span>VetoLayer</span><span>Reason before the action is real.</span><span>Powered by SERV Reasoning</span></footer>
    </main>
  );
}

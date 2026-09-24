import Link from "next/link";
import { VetoLayerLogo } from "../../components/vetolayer-logo";
import { FlagshipDemoClient } from "./demo-client";
import "./demo-mode.css";

export default function DemoPage() {
  return (
    <main className="demoPage" id="main-content" tabIndex={-1}>
      <nav className="demoNav" aria-label="Demo navigation">
        <Link href="/" className="brand" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link>
        <Link href="/dashboard" className="rowLink">Open control center →</Link>
      </nav>

      <header className="demoHero">
        <div className="demoModeLabel">DEMO MODE · SEEDED SCENARIO · REAL DECISION PIPELINE</div>
        <p className="eyebrow">LIVE FLAGSHIP SCENARIO</p>
        <h1>The agent has permission.<br />Should it deploy?</h1>
        <p>
          A critical security patch touches authentication during a restricted production window.
          VetoLayer combines hard controls with SERV reasoning over the exception—and changes its
          decision only when the evidence changes.
        </p>
        <div className="demoTrustNote">
          <strong>What is seeded:</strong> PR metadata, incident context, CI state, and the demo security-lead review evidence. <strong>What is real:</strong> the deterministic policy engine, SERV contextual judgment, orchestration, and Decision Receipt generation run on every evaluation. The complete REVIEW → approval evidence → re-evaluation flow works on this page without signing in.
        </div>
      </header>

      <FlagshipDemoClient />

      <section className="demoExplainer" aria-label="How the flagship scenario works">
        <article><span>01</span><h3>Same action</h3><p>The PR, commit, changed files, incident, and CI evidence stay fixed across both evaluations.</p></article>
        <article><span>02</span><h3>One missing condition</h3><p>The first pass has no authorized human approval, so VetoLayer refuses to silently promote it to ALLOW.</p></article>
        <article><span>03</span><h3>Real re-evaluation</h3><p>The seeded security-lead approval is added as human-review evidence; then the entire deterministic + SERV pipeline runs again and issues a new receipt.</p></article>
      </section>
    </main>
  );
}

import Link from "next/link";
import { FlagshipDemoClient } from "./demo-client";

export default function DemoPage() {
  return (
    <main className="demoPage">
      <nav className="demoNav">
        <Link href="/" className="brand"><span className="mark">V</span> VetoLayer</Link>
        <Link href="/dashboard" className="rowLink">Open control center →</Link>
      </nav>

      <header className="demoHero">
        <p className="eyebrow">LIVE FLAGSHIP SCENARIO</p>
        <h1>The agent has permission.<br />Should it deploy?</h1>
        <p>
          A critical security patch touches authentication during a restricted production window.
          VetoLayer combines hard controls with SERV reasoning over the exception—and changes its
          decision only when the evidence changes.
        </p>
      </header>

      <FlagshipDemoClient />

      <section className="demoExplainer">
        <article><span>01</span><h3>Same action</h3><p>The PR, commit, changed files, incident, and CI evidence stay fixed across both evaluations.</p></article>
        <article><span>02</span><h3>One missing condition</h3><p>The first pass has no authorized human approval, so VetoLayer refuses to silently promote it to ALLOW.</p></article>
        <article><span>03</span><h3>Real re-evaluation</h3><p>After approval arrives, the entire deterministic + SERV pipeline runs again and issues a new receipt.</p></article>
      </section>
    </main>
  );
}

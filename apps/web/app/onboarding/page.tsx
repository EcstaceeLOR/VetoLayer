import Link from "next/link";
import { OnboardingFlow } from "../../components/onboarding-flow";

export default function OnboardingPage() {
  return (
    <main className="onboardingShell">
      <nav className="onboardingNav"><Link href="/" className="brand"><span className="mark">V</span> VetoLayer</Link><Link href="/demo">View demo instead</Link></nav>
      <div className="onboardingLayout">
        <aside className="onboardingAside">
          <p className="eyebrow">GET TO YOUR FIRST DECISION</p>
          <h2>Set up the control layer, not another AI dashboard.</h2>
          <p>VetoLayer only needs enough context to know what an agent is trying to do, which policies apply, and what evidence should be trusted.</p>
          <div className="onboardingPrinciples"><div><span>01</span><p><strong>Hard rules stay hard</strong>Deterministic restrictions never become fuzzy model judgment.</p></div><div><span>02</span><p><strong>SERV handles ambiguity</strong>Context, exceptions, conflicting evidence, and uncertainty are reasoned over explicitly.</p></div><div><span>03</span><p><strong>Every verdict is inspectable</strong>Decision Receipts preserve what happened and why.</p></div></div>
        </aside>
        <OnboardingFlow />
      </div>
    </main>
  );
}

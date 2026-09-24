import Link from "next/link";
import { OnboardingFlow } from "../../components/onboarding-flow";
import { VetoLayerLogo } from "../../components/vetolayer-logo";

export default function OnboardingPage() {
  return (
    <main className="onboardingShell" id="main-content" tabIndex={-1}>
      <nav className="onboardingNav" aria-label="Onboarding navigation">
        <Link href="/" className="brand" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link>
        <Link href="/demo">View demo instead</Link>
      </nav>
      <div className="onboardingLayout">
        <aside className="onboardingAside" aria-label="VetoLayer onboarding principles">
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

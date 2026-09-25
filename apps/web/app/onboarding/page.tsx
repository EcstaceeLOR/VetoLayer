import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "../../components/onboarding-flow";
import { Notice } from "../../components/ui/primitives";
import { VetoLayerLogo } from "../../components/vetolayer-logo";
import { loadOnboardingSnapshot } from "../../lib/server/onboarding-progress";
import "./onboarding.css";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let snapshot;
  try {
    snapshot = await loadOnboardingSnapshot();
  } catch {
    return (
      <main className="onboardingShell onboardingOperationalShell" id="main-content" tabIndex={-1}>
        <nav className="onboardingNav" aria-label="Onboarding navigation">
          <Link href="/" className="brand" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link>
          <Link href="/account">Account & security</Link>
        </nav>
        <div className="onboardingUnavailable">
          <Notice tone="danger" title="Setup service unavailable">
            VetoLayer could not load durable onboarding state. Confirm Supabase persistence is configured and the Issue #55 onboarding migration has been applied, then reload this page.
          </Notice>
        </div>
      </main>
    );
  }

  if (!snapshot) redirect("/login?next=/onboarding");

  return (
    <main className="onboardingShell onboardingOperationalShell" id="main-content" tabIndex={-1}>
      <nav className="onboardingNav" aria-label="Onboarding navigation">
        <Link href="/" className="brand" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link>
        <div className="onboardingNavActions">
          {snapshot.selected ? <Link href="/dashboard">Exit and resume later</Link> : <Link href="/">Exit setup</Link>}
          <Link href="/account">Account</Link>
        </div>
      </nav>
      <OnboardingFlow initialSnapshot={snapshot} />
    </main>
  );
}

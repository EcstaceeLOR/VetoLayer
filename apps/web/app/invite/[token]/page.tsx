import Link from "next/link";
import { InviteAcceptance } from "../../../components/invite-acceptance";
import { VetoLayerLogo } from "../../../components/vetolayer-logo";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="authShell" id="main-content" tabIndex={-1}>
      <div className="authFrame">
        <Link href="/" className="brand authBrand" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link>
        <section className="authIntro">
          <p className="vlEyebrow">Team access</p>
          <h1>Govern high-impact actions together.</h1>
          <p>Workspace roles keep policy administration, human review, and ordinary product access separate instead of making every teammate an administrator.</p>
        </section>
        <InviteAcceptance token={token} />
      </div>
    </main>
  );
}

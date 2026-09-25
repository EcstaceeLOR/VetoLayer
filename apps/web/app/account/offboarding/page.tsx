import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountOffboardingPanel } from "../../../components/account-offboarding-panel";
import { VetoLayerLogo } from "../../../components/vetolayer-logo";
import { getAuthenticatedIdentity } from "../../../lib/server/workspace";
import "../security.css";

export const dynamic = "force-dynamic";

export default async function AccountOffboardingPage() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) redirect("/login?error=session_expired&next=/account/offboarding");
  return (
    <main className="accountShell" id="main-content" tabIndex={-1}>
      <header className="accountHeader"><Link href="/dashboard" className="brand"><VetoLayerLogo size="md" /></Link><Link className="vlButton vlButtonSecondary vlButtonSm" href="/account">Back to account security</Link></header>
      <div className="accountTitleRow"><div><p className="vlEyebrow">Account offboarding</p><h1>Leave deliberately, without corrupting history.</h1><p>Live access and personal notification state can be removed after workspace ownership is resolved. Historical signed receipts and append-only audit events retain integrity metadata.</p></div></div>
      <AccountOffboardingPanel />
    </main>
  );
}

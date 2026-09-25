import Link from "next/link";
import { redirect } from "next/navigation";
import { COMMERCIAL_PLAN_ORDER, COMMERCIAL_PLANS, formatCommercialLimit } from "../../../lib/commercial-plans";
import { getCommercialSnapshot } from "../../../lib/server/commercial";
import { getAuthenticatedWorkspace } from "../../../lib/server/workspace";
import "./billing.css";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) redirect("/onboarding");
  const snapshot = await getCommercialSnapshot(workspace.workspaceId);
  const period = `${new Date(snapshot.usage.periodStart).toLocaleDateString()} – ${new Date(new Date(snapshot.usage.periodEnd).getTime() - 1).toLocaleDateString()}`;

  return (
    <div className="billingPage">
      <header className="billingHero">
        <div><p className="vlEyebrow">PLAN & USAGE</p><h1>Know exactly what the workspace is using.</h1><p>Capacity is calculated from persisted workspace members, projects, and Decision Receipts. Client-side requests cannot raise these limits.</p></div>
        <Link className="billingPricingLink" href="/pricing">Public pricing →</Link>
      </header>

      <section className="billingPlanCard vlCard vlCardRaised">
        <div><span className="billingKicker">Current plan</span><h2>{snapshot.plan.name}</h2><p>{snapshot.plan.audience}</p></div>
        <div className="billingPlanPrice"><strong>{snapshot.plan.priceLabel}</strong><small>{snapshot.plan.billingNote}</small></div>
      </section>

      <section className="billingSection">
        <div className="billingSectionHead"><div><p className="vlEyebrow">CURRENT PERIOD</p><h2>Workspace usage</h2></div><span>{period}</span></div>
        <div className="usageGrid">
          {snapshot.meters.map((meter) => {
            const ratio = meter.limit === null || meter.limit === 0 ? 0 : Math.min(100, Math.round((meter.current / meter.limit) * 100));
            return <article className={`usageCard ${meter.state}`} key={meter.key}>
              <div className="usageCardTop"><span>{meter.label}</span><strong>{meter.current.toLocaleString()} <small>/ {formatCommercialLimit(meter.limit)}</small></strong></div>
              {meter.limit === null ? <div className="usageUnlimited">Metered for visibility · no hard limit</div> : <div className="usageTrack" aria-label={`${meter.label} ${ratio}% used`}><i style={{ width: `${ratio}%` }} /></div>}
              {meter.state === "warning" ? <p>Approaching the current plan limit.</p> : meter.state === "limit" ? <p>Limit reached. New server-side operations for this meter are blocked.</p> : null}
            </article>;
          })}
        </div>
        <p className="billingSeatNote">Active members: {snapshot.usage.activeMembers}. Pending invitations reserving seats: {snapshot.usage.pendingInvitations}. SERV-assisted evaluations are measured from receipts with contextual findings/provider traces.</p>
      </section>

      <section className="billingSection">
        <div className="billingSectionHead"><div><p className="vlEyebrow">PLAN MODEL</p><h2>What scales between plans</h2></div><span>{snapshot.persistence === "supabase" ? "Durable plan state" : "Development memory"}</span></div>
        <div className="billingPlanGrid">
          {COMMERCIAL_PLAN_ORDER.map((id) => {
            const plan = COMMERCIAL_PLANS[id];
            const current = id === snapshot.plan.id;
            return <article className={`billingTier vlCard ${current ? "current" : ""}`} key={id}>
              <div className="billingTierHead"><div><span>{current ? "CURRENT" : "PLAN"}</span><h3>{plan.name}</h3></div><strong>{plan.priceLabel}</strong></div>
              <p>{plan.audience}</p>
              <dl><div><dt>Projects</dt><dd>{formatCommercialLimit(plan.limits.projects)}</dd></div><div><dt>Members</dt><dd>{formatCommercialLimit(plan.limits.members)}</dd></div><div><dt>Decisions / month</dt><dd>{formatCommercialLimit(plan.limits.decisionsPerMonth)}</dd></div><div><dt>SERV usage</dt><dd>Metered</dd></div></dl>
            </article>;
          })}
        </div>
      </section>

      <section className="billingNotice vlCard">
        <div><p className="vlEyebrow">BILLING STATUS</p><h2>No simulated checkout.</h2><p>VetoLayer does not collect card details or pretend a payment succeeded. Developer is immediately usable. Team and Scale are published commercial tiers, but paid activation remains server-controlled until a real billing-provider workflow is connected.</p></div>
        <Link href="/dashboard/settings" className="billingPricingLink">Workspace settings →</Link>
      </section>
    </div>
  );
}

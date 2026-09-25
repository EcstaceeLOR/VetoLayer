import Link from "next/link";
import { ButtonLink } from "../../components/ui/primitives";
import { VetoLayerLogo } from "../../components/vetolayer-logo";
import { COMMERCIAL_PLAN_ORDER, COMMERCIAL_PLANS, formatCommercialLimit } from "../../lib/commercial-plans";
import { isSupabaseAuthConfigured } from "../../lib/supabase/server";
import "./pricing.css";

export default function PricingPage() {
  const authConfigured = isSupabaseAuthConfigured();
  return (
    <main className="pricingPage" id="main-content" tabIndex={-1}>
      <nav className="pricingNav" aria-label="Pricing navigation"><Link href="/" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link><div><Link href="/">Product</Link>{authConfigured ? <Link href="/login">Sign in</Link> : null}</div></nav>

      <header className="pricingHero"><p className="vlEyebrow">PRICING</p><h1>Start governing agent actions for free. Scale capacity when the workspace needs it.</h1><p>Every tier keeps the same safety model: deterministic policy remains authoritative, contextual uncertainty can route to SERV, human review never overrides a hard BLOCK, and decisions produce auditable receipts.</p></header>

      <section className="pricingGrid" aria-label="VetoLayer plans">
        {COMMERCIAL_PLAN_ORDER.map((id) => {
          const plan = COMMERCIAL_PLANS[id];
          return <article className={`pricingCard ${id === "team" ? "featured" : ""}`} key={id}>
            <div className="pricingCardHead"><span>{plan.name}</span><strong>{plan.priceLabel}</strong></div>
            <p>{plan.audience}</p>
            <dl><div><dt>Projects</dt><dd>{formatCommercialLimit(plan.limits.projects)}</dd></div><div><dt>Members</dt><dd>{formatCommercialLimit(plan.limits.members)}</dd></div><div><dt>Decisions / month</dt><dd>{formatCommercialLimit(plan.limits.decisionsPerMonth)}</dd></div><div><dt>SERV-assisted decisions</dt><dd>Metered</dd></div></dl>
            <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            <div className="pricingAction">{id === "developer" ? <ButtonLink tone="primary" href={authConfigured ? "/onboarding" : "/#developers"}>Start on Developer</ButtonLink> : <div><strong>Paid activation is not self-serve yet.</strong><small>{plan.billingNote}</small></div>}</div>
          </article>;
        })}
      </section>

      <section className="pricingTruth"><div><p className="vlEyebrow">BILLING PRINCIPLE</p><h2>No fake checkout.</h2></div><p>The product publishes its commercial model and enforces assigned plan limits on the server. VetoLayer will not show a card form, success screen, or paid upgrade button until a real billing provider can create and verify the subscription.</p></section>

      <section className="pricingFaq"><h2>What usage is measured?</h2><div><article><strong>Projects & members</strong><p>Active projects, active members, and pending invitations that reserve seats.</p></article><article><strong>Decisions</strong><p>Decision Receipts created during the current UTC calendar month.</p></article><article><strong>SERV</strong><p>Receipts containing contextual findings or provider trace metadata. It is visible as cost-relevant usage even where the tier has no hard SERV cap.</p></article></div></section>

      <footer className="pricingFooter"><VetoLayerLogo size="sm" /><span>Transparent capacity. Server-enforced limits. Real billing only when it is actually connected.</span><Link href="/">Back to product</Link></footer>
    </main>
  );
}

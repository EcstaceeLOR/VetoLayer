import Link from "next/link";
import { MarketingProductProof } from "../components/marketing-product-proof";
import { ArrowRightIcon } from "../components/ui/icons";
import { Badge, ButtonLink } from "../components/ui/primitives";
import { VetoLayerLogo } from "../components/vetolayer-logo";
import { isSupabaseAuthConfigured } from "../lib/supabase/server";

const controlPath = [
  ["01", "Proposed action", "An agent asks to merge, deploy, refund, purchase, change permissions, or call another high-impact tool."],
  ["02", "Deterministic policy", "Hard rules verify permissions, thresholds, protected environments, required evidence, and explicit denies."],
  ["03", "Contextual judgment", "Only genuine ambiguity, evidence conflict, and documented exceptions are routed to SERV Reasoning."],
  ["04", "Execution verdict", "ALLOW, REVIEW, or BLOCK returns with an auditable Decision Receipt and requirements for changing the outcome."],
] as const;

const productCapabilities = [
  ["Policy Studio", "Write hard deterministic controls and contextual policies without turning every rule into an LLM prompt."],
  ["Human Review", "Route unresolved actions to people, capture their judgment as evidence, and re-run the full gate instead of overriding it."],
  ["Decision Receipts", "Inspect policy findings, evidence, SERV traces, unresolved conditions, versions, timestamps, and a SHA-256 integrity marker."],
  ["Integration boundary", "Put VetoLayer in front of GitHub or any server-side tool call without replacing the agent framework you already use."],
] as const;

const useCases = [
  ["Developer agents", "Gate pull-request merges, production deploys, infrastructure changes, protected configuration, and security-sensitive actions."],
  ["Customer operations", "Control refunds, credits, cancellations, account changes, and exceptions where evidence and policy context matter."],
  ["Finance & procurement", "Evaluate payments, invoices, vendor changes, approvals, and unusual transaction context before money moves."],
] as const;

const securityPoints = [
  ["Fail closed", "Missing critical evidence, malformed provider output, and reasoning-provider failures never silently become ALLOW."],
  ["Hard rules stay authoritative", "A contextual result cannot override an explicit deterministic BLOCK."],
  ["Server-owned boundaries", "Workspace identity and production API boundaries are resolved server-side rather than trusted from browser headers."],
  ["Auditable outputs", "Every evaluation can produce a receipt with decision lineage, evidence, findings, trace metadata, and tamper-evident hashing."],
] as const;

export default function HomePage() {
  const authConfigured = isSupabaseAuthConfigured();
  const primaryHref = authConfigured ? "/onboarding" : "#developers";
  const primaryLabel = authConfigured ? "Get started" : "Integrate VetoLayer";

  return (
    <main className="marketingShell marketingV2" id="main-content" tabIndex={-1}>
      <nav className="marketingNav marketingNavV2" aria-label="Main navigation">
        <Link href="/" className="brand" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link>
        <div className="marketingNavCenter">
          <a href="#product">Product</a>
          <a href="#use-cases">Use cases</a>
          <a href="#developers">Developers</a>
          <a href="#security">Security</a>
        </div>
        <div className="marketingNavActions">
          <Link className="marketingExampleLink" href="/demo">Example</Link>
          {authConfigured ? <Link className="marketingSignIn" href="/login">Sign in</Link> : null}
          <ButtonLink tone="primary" size="sm" href={primaryHref}>{primaryLabel}</ButtonLink>
        </div>
      </nav>

      <section className="marketingHero marketingHeroV2">
        <div className="heroCopy">
          <Badge tone="accent">Control plane for high-impact agent actions</Badge>
          <h1>Give agents autonomy.<br /><em>Keep execution governed.</em></h1>
          <p className="heroLead">
            VetoLayer sits between an AI agent and the tools that can change production, move money, or affect customers. Hard policy runs deterministically. SERV handles contextual judgment. Humans resolve what remains uncertain. Every result is auditable.
          </p>
          <div className="heroActions">
            <ButtonLink tone="primary" size="lg" href={primaryHref}>{primaryLabel}<ArrowRightIcon /></ButtonLink>
            <ButtonLink tone="secondary" size="lg" href="#product">Explore the product</ButtonLink>
          </div>
          <div className="heroTrustRow" aria-label="VetoLayer product properties">
            <span><b>01</b> Hard policy first</span>
            <span><b>02</b> Context only when needed</span>
            <span><b>03</b> Human review without overrides</span>
            <span><b>04</b> Receipt for every verdict</span>
          </div>
        </div>
        <MarketingProductProof />
      </section>

      <section className="marketingThesis" id="product">
        <div className="marketingSectionIntro">
          <p className="vlEyebrow">The missing control layer</p>
          <h2>Access control asks whether an agent <em>can</em> act.<br />VetoLayer decides whether it <em>should</em>.</h2>
        </div>
        <p className="marketingThesisCopy">
          Credentials and permissions are necessary, but they do not understand why an action is happening now, whether required evidence is current, whether a policy exception actually applies, or what remains unresolved. VetoLayer makes that judgment explicit before execution.
        </p>
      </section>

      <section className="marketingCapabilitySection">
        <div className="marketingSectionHeader">
          <div><p className="vlEyebrow">Product</p><h2>A control surface, not another agent framework.</h2></div>
          <p>Keep your existing agents and tools. Add a decision boundary in front of actions that deserve policy, evidence, contextual reasoning, or human judgment.</p>
        </div>
        <div className="capabilityGrid">
          {productCapabilities.map(([title, copy], index) => (
            <article className="capabilityCard vlCard" key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="controlPathSection marketingControlPath">
        <div className="marketingSectionHeader">
          <div><p className="vlEyebrow">Decision path</p><h2>Every action takes the same explainable route.</h2></div>
          <p>Deterministic policy remains authoritative. SERV is invoked only where policy interpretation needs context. REVIEW is a first-class state, not a provider failure.</p>
        </div>
        <div className="controlPathGrid controlPathGridV2">
          {controlPath.map(([number, title, copy]) => (
            <article key={number} className="controlPathCard vlCard">
              <span>{number}</span><h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="useCasesSection" id="use-cases">
        <div className="marketingSectionIntro narrow">
          <p className="vlEyebrow">Use cases</p>
          <h2>Start where a wrong action is expensive.</h2>
          <p>VetoLayer starts with coding and deployment agents, but its decision contract is intentionally horizontal: action, policy, evidence, judgment, verdict, receipt.</p>
        </div>
        <div className="useCaseGrid useCaseGridV2">
          {useCases.map(([title, copy], index) => (
            <article className="vlCard" key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>

      <section className="developerSection" id="developers">
        <div className="developerCopy">
          <p className="vlEyebrow">Developers</p>
          <h2>Put one guard in front of the tool call.</h2>
          <p>Use the lightweight TypeScript SDK or call the evaluation API directly. Your agent proposes an action; VetoLayer evaluates it; your code executes only on ALLOW.</p>
          <div className="developerFacts">
            <span><b>POST</b> /api/v1/evaluate</span>
            <span><b>SDK</b> @vetolayer/sdk</span>
            <span><b>Verdicts</b> ALLOW · REVIEW · BLOCK</span>
          </div>
          {authConfigured ? <ButtonLink tone="primary" href="/dashboard/integrations">Open integration setup<ArrowRightIcon /></ButtonLink> : <ButtonLink tone="secondary" href="/demo">Inspect an evaluated example</ButtonLink>}
        </div>
        <div className="developerCode vlCard vlCardRaised" aria-label="VetoLayer SDK example">
          <div className="developerCodeTop"><span>TypeScript</span><span>server-side</span></div>
          <pre><code>{`import { createVetoLayerClient, guardedToolCall } from "@vetolayer/sdk";

const veto = createVetoLayerClient({
  baseUrl: process.env.VETOLAYER_URL!,
  apiKey: process.env.VETOLAYER_API_KEY,
});

const result = await guardedToolCall({
  client: veto,
  evaluation,
  execute: () => highImpactToolCall(),
});`}</code></pre>
        </div>
      </section>

      <section className="securitySection" id="security">
        <div className="marketingSectionHeader">
          <div><p className="vlEyebrow">Safety architecture</p><h2>Reasoning is constrained by policy, evidence, and failure rules.</h2></div>
          <p>VetoLayer does not hand the final word to a model. Its orchestration is designed so uncertainty creates friction rather than accidental execution.</p>
        </div>
        <div className="securityGrid">
          {securityPoints.map(([title, copy]) => <article key={title}><strong>{title}</strong><p>{copy}</p></article>)}
        </div>
      </section>

      <section className="productExampleBand vlCard">
        <div><Badge tone="info">Secondary example</Badge><h2>Want to see the entire REVIEW → evidence → re-evaluation loop?</h2><p>The seeded example is a teaching surface. It runs through the real VetoLayer evaluation pipeline, but it is not presented as workspace activity.</p></div>
        <ButtonLink tone="secondary" size="lg" href="/demo">Open product example<ArrowRightIcon /></ButtonLink>
      </section>

      <section className="finalCta finalCtaV2">
        <div><p className="vlEyebrow">Govern execution</p><h2>Let agents move fast without giving them the final word.</h2></div>
        <div className="heroActions">
          <ButtonLink tone="primary" size="lg" href={primaryHref}>{primaryLabel}<ArrowRightIcon /></ButtonLink>
          {authConfigured ? <ButtonLink tone="ghost" size="lg" href="/login">Sign in</ButtonLink> : null}
        </div>
      </section>

      <footer className="marketingFooter marketingFooterV2">
        <div><VetoLayerLogo size="sm" /><p>Reason before the action is real.</p></div>
        <div><a href="#product">Product</a><a href="#use-cases">Use cases</a><a href="#developers">Developers</a><a href="#security">Security</a></div>
        <div><Link href="/demo">Example</Link>{authConfigured ? <Link href="/login">Sign in</Link> : null}</div>
      </footer>
    </main>
  );
}

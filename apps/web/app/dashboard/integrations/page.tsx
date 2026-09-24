import Link from "next/link";

const integrations = [
  { name: "GitHub Gate", state: "Available now", copy: "Collect pull-request, review, changed-file, and CI evidence before a coding agent merges or deploys.", action: "/demo", actionLabel: "See it in action →" },
  { name: "Developer API", state: "Product surface", copy: "Submit any Action Request to the same VetoLayer orchestrator without coupling your agent to the dashboard.", action: "/dashboard/integrations", actionLabel: "API setup follows →" },
  { name: "MCP / custom tools", state: "Via developer API", copy: "Wrap high-impact tool calls with one evaluate-before-execute step while keeping your agent framework unchanged.", action: "/dashboard/integrations", actionLabel: "Use the API boundary →" },
] as const;

export default function IntegrationsPage() {
  return (
    <>
      <header className="dashboardHeader compactHeader"><div><p className="eyebrow">INTEGRATIONS</p><h1 className="dashboardTitle">Put VetoLayer in front of the tool, not inside the agent.</h1><p className="dashboardIntro">The product stays framework-agnostic. Integrations translate real tool context into VetoLayer&apos;s stable Action Request and evidence contracts.</p></div></header>
      <section className="integrationGrid dashboardSection">
        {integrations.map((integration, index) => (
          <article className="integrationCard" key={integration.name}>
            <div className="integrationIcon">{index === 0 ? "GH" : index === 1 ? "API" : "<>"}</div>
            <span className={index === 0 ? "integrationState live" : "integrationState"}>{integration.state}</span>
            <h3>{integration.name}</h3><p>{integration.copy}</p>
            <Link href={integration.action}>{integration.actionLabel}</Link>
          </article>
        ))}
      </section>
      <div className="surfaceNote">Credential entry, connection testing, and developer API copy-paste setup are intentionally completed in the dedicated integration/API issues.</div>
    </>
  );
}

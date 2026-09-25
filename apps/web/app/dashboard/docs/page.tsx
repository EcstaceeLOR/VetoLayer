import Link from "next/link";
import { DOCS_RELEASE, productDocsByGroup } from "../../../lib/product-docs";
import "./docs.css";

export default function DocumentationPage() {
  const groups = productDocsByGroup();
  return (
    <section className="docsPage">
      <header className="docsHero">
        <div>
          <p className="eyebrow">DOCUMENTATION</p>
          <h1 className="dashboardTitle">Operate VetoLayer without repository archaeology.</h1>
          <p className="dashboardIntro">Product concepts, integration setup, API and SDK usage, policy authoring, review operations, troubleshooting, webhook verification, and release notes—versioned with the product.</p>
        </div>
        <div className="docsReleaseBadge"><span>Docs release</span><strong>{DOCS_RELEASE}</strong><small>Updated 25 Sep 2026</small></div>
      </header>

      <div className="docsQuickActions">
        <Link href="/dashboard/docs/developer-quickstart">Developer quickstart →</Link>
        <Link href="/dashboard/docs/github-app">GitHub App setup →</Link>
        <Link href="/dashboard/docs/troubleshooting">Troubleshooting →</Link>
        <Link href="/dashboard/docs/release-notes">Release notes →</Link>
      </div>

      {groups.map((group) => (
        <section className="docsGroup" key={group.group}>
          <div className="docsGroupHeading"><span>{group.group}</span><h2>{group.group === "Start" ? "Understand the model" : group.group === "Build" ? "Integrate and configure" : group.group === "Operate" ? "Run production workflows" : "Exact contracts and changes"}</h2></div>
          <div className="docsCardGrid">
            {group.topics.map((topic) => (
              <Link className="docsCard" href={`/dashboard/docs/${topic.slug}`} key={topic.slug}>
                <span className="docsCardMeta">Updated {topic.updated}</span>
                <h3>{topic.title}</h3>
                <p>{topic.summary}</p>
                <strong>Open guide →</strong>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS_RELEASE, getProductDoc, productDocs } from "../../../../lib/product-docs";
import "../docs.css";

export function generateStaticParams() {
  return productDocs.map((topic) => ({ slug: topic.slug }));
}

export default async function DocumentationTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = getProductDoc(slug);
  if (!topic) notFound();

  return (
    <article className="docsArticle">
      <header className="docsArticleHeader">
        <div>
          <Link className="docsBack" href="/dashboard/docs">← Documentation</Link>
          <p className="eyebrow">{topic.group.toUpperCase()} · DOCS {DOCS_RELEASE}</p>
          <h1>{topic.title}</h1>
          <p>{topic.summary}</p>
        </div>
        <div className="docsArticleMeta"><span>Last updated</span><strong>{topic.updated}</strong><small>Versioned with VetoLayer release {DOCS_RELEASE}</small></div>
      </header>

      <div className="docsArticleLayout">
        <nav className="docsToc" aria-label="On this page">
          <strong>On this page</strong>
          {topic.sections.map((section, index) => <a key={section.heading} href={`#section-${index + 1}`}>{section.heading}</a>)}
          <Link href="/dashboard/docs/release-notes">Release notes</Link>
        </nav>
        <div className="docsArticleBody">
          {topic.sections.map((section, index) => (
            <section key={section.heading} id={`section-${index + 1}`}>
              <h2>{section.heading}</h2>
              {section.body?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets?.length ? <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
              {section.code ? <pre><code>{section.code}</code></pre> : null}
            </section>
          ))}
          <div className="docsArticleFooter">
            <strong>Need the operational surface?</strong>
            <p>These docs describe current product behavior. Use the dashboard links below to configure or investigate the live workspace state.</p>
            <div><Link href="/dashboard/developers">Developer</Link><Link href="/dashboard/policies">Policies</Link><Link href="/dashboard/reviews">Reviews</Link><Link href="/dashboard/decisions">Decisions</Link></div>
          </div>
        </div>
      </div>
    </article>
  );
}

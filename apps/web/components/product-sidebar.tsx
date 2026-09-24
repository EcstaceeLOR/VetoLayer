import Link from "next/link";

const navigation = [
  ["Overview", "/dashboard"],
  ["Decisions", "/dashboard#decisions"],
  ["Policies", "/dashboard/policies"],
  ["Reviews", "/dashboard/reviews"],
  ["Integrations", "/dashboard/integrations"],
] as const;

export function ProductSidebar() {
  return (
    <aside className="sidebar">
      <Link href="/" className="brand dashboardBrand"><span className="mark">V</span> VetoLayer</Link>
      <div className="workspaceTag"><span className="workspaceDot" /> Acme Engineering</div>
      <nav className="sideNav" aria-label="Product navigation">
        {navigation.map(([label, href]) => <Link href={href} key={label}>{label}</Link>)}
      </nav>
      <div className="sideDemoCta">
        <span>See the decision engine live</span>
        <Link href="/demo">Run flagship demo →</Link>
      </div>
      <div className="sideFoot">
        <span className="pulse" /> SERV reasoning online
        <small>Deterministic + contextual control</small>
      </div>
    </aside>
  );
}

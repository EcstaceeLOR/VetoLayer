import Link from "next/link";
import type { ReactNode } from "react";
import { ProductNavigation } from "../../components/product-navigation";
import "./health.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="productShell">
      <aside className="sidebar">
        <Link href="/" className="brand dashboardBrand"><span className="mark">V</span> VetoLayer</Link>
        <div className="workspaceTag"><span className="workspaceDot" /> Acme Engineering</div>
        <ProductNavigation />
        <div className="sideDemoCard">
          <span>FLAGSHIP SCENARIO</span>
          <strong>Auth patch → production</strong>
          <p>See SERV reason over a live policy exception and changing evidence.</p>
          <Link href="/demo">Open demo →</Link>
        </div>
        <div className="sideFoot">
          <span><i className="pulse" /> SERV reasoning online</span>
          <small>Hard policy + contextual judgment</small>
        </div>
      </aside>
      <main className="dashboardMain">
        <div className="dashboardTopbar">
          <div><span className="workspaceCrumb">Acme Engineering</span><span>/</span><strong>Production Gate</strong></div>
          <div className="topbarActions"><Link href="/onboarding">New project</Link><span className="avatar" aria-label="Workspace owner">A</span></div>
        </div>
        {children}
      </main>
    </div>
  );
}

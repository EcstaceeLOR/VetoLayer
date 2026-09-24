import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ProductNavigation } from "../../components/product-navigation";
import { getAuthenticatedWorkspace } from "../../lib/server/workspace";
import { signOut } from "../login/actions";
import "./health.css";
import "./auth-workspace.css";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) redirect("/login?next=/dashboard");

  const avatar = (workspace.email?.[0] ?? workspace.label[0] ?? "V").toUpperCase();

  return (
    <div className="productShell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <Link href="/" className="brand dashboardBrand"><span className="mark">V</span> VetoLayer</Link>
        <div className="workspaceTag" title={workspace.email}><span className="workspaceDot" aria-hidden="true" /> {workspace.label}</div>
        <ProductNavigation />
        <div className="sideDemoCard">
          <span>FLAGSHIP SCENARIO</span>
          <strong>Auth patch → production</strong>
          <p>See SERV reason over a live policy exception and changing evidence.</p>
          <Link href="/demo">Open demo →</Link>
        </div>
        <div className="sideFoot" role="status">
          <span><i className="pulse" aria-hidden="true" /> SERV reasoning online</span>
          <small>Hard policy + contextual judgment</small>
        </div>
      </aside>
      <main className="dashboardMain" id="main-content" tabIndex={-1}>
        <div className="dashboardTopbar">
          <div><span className="workspaceCrumb">{workspace.label}</span><span aria-hidden="true">/</span><strong>Production Gate</strong></div>
          <div className="topbarActions">
            <Link href="/onboarding">New project</Link>
            <span className="avatar" aria-label={`Signed in as ${workspace.email ?? workspace.label}`} title={workspace.email}>{avatar}</span>
            <form action={signOut}><button className="topbarSignOut" type="submit">Sign out</button></form>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

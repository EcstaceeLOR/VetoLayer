import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ProductNavigation } from "../../components/product-navigation";
import { Badge, Button, ButtonLink } from "../../components/ui/primitives";
import { VetoLayerLogo } from "../../components/vetolayer-logo";
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
        <Link href="/" className="brand dashboardBrand" aria-label="VetoLayer home"><VetoLayerLogo size="sm" /></Link>
        <div className="workspaceTag" title={workspace.email}><span className="workspaceDot" aria-hidden="true" /> {workspace.label}</div>
        <ProductNavigation />
        <div className="sideDemoCard vlCard">
          <Badge tone="info">Example</Badge>
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
            <ButtonLink tone="ghost" size="sm" href="/onboarding">New project</ButtonLink>
            <span className="avatar" aria-label={`Signed in as ${workspace.email ?? workspace.label}`} title={workspace.email}>{avatar}</span>
            <form action={signOut}><Button tone="ghost" size="sm" type="submit">Sign out</Button></form>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

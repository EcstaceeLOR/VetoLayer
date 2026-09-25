import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ProductCommandMenu } from "../../components/product-command-menu";
import { ProductNavigation } from "../../components/product-navigation";
import { ProductBreadcrumbs, WorkspaceProjectContext } from "../../components/product-shell-context";
import { ReviewIcon } from "../../components/ui/icons";
import { Button } from "../../components/ui/primitives";
import { VetoLayerLogo } from "../../components/vetolayer-logo";
import { getAuthenticatedWorkspace } from "../../lib/server/workspace";
import { signOut } from "../login/actions";
import "./health.css";
import "./auth-workspace.css";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) redirect("/login?error=session_expired&next=/dashboard");

  const identityLabel = workspace.displayName ?? workspace.email ?? workspace.label;
  const avatar = (workspace.displayName?.[0] ?? workspace.email?.[0] ?? workspace.label[0] ?? "V").toUpperCase();

  return (
    <div className="productShell productShellV2">
      <aside className="sidebar productSidebar" aria-label="Workspace navigation">
        <Link href="/dashboard" className="brand dashboardBrand" aria-label="VetoLayer control center"><VetoLayerLogo size="sm" /></Link>
        <WorkspaceProjectContext workspace={workspace.label} />
        <ProductNavigation />

        <div className="sidebarResources">
          <span className="sideNavLabel">Resources</span>
          <Link href="/#developers">Developer setup</Link>
          <Link href="/demo">Product example</Link>
        </div>

        <div className="sideFoot" role="status">
          <span><i className="pulse" aria-hidden="true" /> Decision engine available</span>
          <small>Hard policy first · contextual judgment second</small>
        </div>
      </aside>

      <main className="dashboardMain productMain" id="main-content" tabIndex={-1}>
        <header className="dashboardTopbar productTopbar">
          <ProductBreadcrumbs workspace={workspace.label} />
          <ProductCommandMenu />
          <div className="topbarActions productTopbarActions">
            <Link className="shellIconAction" href="/dashboard/reviews" aria-label="Open human review inbox" title="Human review inbox"><ReviewIcon size={16} /></Link>
            <Link className="shellTextAction" href="/#developers">Help</Link>
            <details className="accountMenu">
              <summary aria-label={`Account menu for ${identityLabel}`}>
                <span className="avatar" aria-hidden="true">{avatar}</span>
                <span className="accountMenuIdentity"><b>{workspace.displayName ?? workspace.label}</b><small>{workspace.email ?? "Workspace owner"}</small></span>
              </summary>
              <div className="accountMenuPanel vlCard vlCardRaised">
                <div className="accountMenuHeader"><span>Signed in as</span><strong>{identityLabel}</strong>{workspace.email && workspace.displayName ? <small>{workspace.email}</small> : null}</div>
                <Link href="/account">Account & security</Link>
                <Link href="/onboarding">Project setup</Link>
                <Link href="/dashboard/integrations">Integration setup</Link>
                <div className="accountMenuDivider" />
                <form action={signOut}><Button tone="ghost" size="sm" type="submit">Sign out this session</Button></form>
              </div>
            </details>
          </div>
        </header>
        <div className="productPage">{children}</div>
      </main>
    </div>
  );
}

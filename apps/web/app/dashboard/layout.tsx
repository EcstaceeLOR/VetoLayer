import Link from "next/link";
import type { ReactNode } from "react";

const navigation = [
  ["Overview", "/dashboard"],
  ["Decisions", "/dashboard#decisions"],
  ["Policies", "/dashboard/policies"],
  ["Reviews", "/dashboard#reviews"],
] as const;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="productShell">
      <aside className="sidebar">
        <Link href="/" className="brand dashboardBrand"><span className="mark">V</span> VetoLayer</Link>
        <div className="workspaceTag"><span className="workspaceDot" /> Acme Engineering</div>
        <nav className="sideNav" aria-label="Product navigation">
          {navigation.map(([label, href]) => (
            <Link href={href} key={label}>{label}</Link>
          ))}
        </nav>
        <div className="sideFoot">
          <span className="pulse" /> SERV reasoning online
          <small>Policy engine v0.1</small>
        </div>
      </aside>
      <main className="dashboardMain">{children}</main>
    </div>
  );
}

import type { ReactNode } from "react";
import { ProductSidebar } from "../../components/product-sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="productShell">
      <ProductSidebar />
      <main className="dashboardMain">{children}</main>
    </div>
  );
}

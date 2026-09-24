"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  ["Overview", "/dashboard"],
  ["Decisions", "/dashboard/decisions"],
  ["Policies", "/dashboard/policies"],
  ["Reviews", "/dashboard/reviews"],
  ["Integrations", "/dashboard/integrations"],
] as const;

export function ProductNavigation() {
  const pathname = usePathname();

  return (
    <nav className="sideNav" aria-label="Product navigation">
      {navigation.map(([label, href]) => {
        const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
        return <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} href={href} key={label}>{label}</Link>;
      })}
    </nav>
  );
}

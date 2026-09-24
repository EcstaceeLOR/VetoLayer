"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DecisionIcon, OverviewIcon, PlugIcon, PolicyIcon, ReviewIcon } from "./ui/icons";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: OverviewIcon },
  { label: "Decisions", href: "/dashboard/decisions", icon: DecisionIcon },
  { label: "Policies", href: "/dashboard/policies", icon: PolicyIcon },
  { label: "Reviews", href: "/dashboard/reviews", icon: ReviewIcon },
  { label: "Integrations", href: "/dashboard/integrations", icon: PlugIcon },
] as const;

export function ProductNavigation() {
  const pathname = usePathname();

  return (
    <nav className="sideNav" aria-label="Product navigation">
      {navigation.map(({ label, href, icon: Icon }) => {
        const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
        return (
          <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} href={href} key={label}>
            <Icon size={16} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

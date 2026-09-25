"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { productNavigation, isProductRouteActive } from "../lib/product-navigation";
import { DecisionIcon, OverviewIcon, PlugIcon, PolicyIcon, ReviewIcon } from "./ui/icons";

const icons = {
  overview: OverviewIcon,
  decision: DecisionIcon,
  review: ReviewIcon,
  policy: PolicyIcon,
  integration: PlugIcon,
} as const;

export function ProductNavigation() {
  const pathname = usePathname();

  return (
    <nav className="sideNav" aria-label="Product navigation">
      {productNavigation.map((section) => (
        <div className="sideNavSection" key={section.label}>
          <span className="sideNavLabel">{section.label}</span>
          <div className="sideNavItems">
            {section.items.map((item) => {
              const active = isProductRouteActive(pathname, item.href);
              const Icon = icons[item.icon];
              return (
                <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} href={item.href} key={item.href} title={item.description}>
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

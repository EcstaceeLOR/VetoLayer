export type ProductNavigationItem = {
  label: string;
  href: string;
  description: string;
  icon: "overview" | "decision" | "review" | "policy" | "integration";
};

export type ProductNavigationSection = {
  label: string;
  items: ProductNavigationItem[];
};

export const productNavigation: ProductNavigationSection[] = [
  {
    label: "Operate",
    items: [
      { label: "Overview", href: "/dashboard", description: "Decision health and current operating state", icon: "overview" },
      { label: "Decisions", href: "/dashboard/decisions", description: "Receipts, evidence, and reasoning traces", icon: "decision" },
      { label: "Reviews", href: "/dashboard/reviews", description: "Actions waiting on human judgment", icon: "review" },
    ],
  },
  {
    label: "Configure",
    items: [
      { label: "Policies", href: "/dashboard/policies", description: "Deterministic rules and contextual policy", icon: "policy" },
      { label: "Integrations", href: "/dashboard/integrations", description: "Connect execution paths and developer access", icon: "integration" },
    ],
  },
];

export const productCommands = [
  ...productNavigation.flatMap((section) => section.items.map((item) => ({ ...item, section: section.label }))),
  { label: "Set up a project", href: "/onboarding", description: "Create or change the current project setup", icon: "overview" as const, section: "Workspace" },
  { label: "Open product example", href: "/demo", description: "See a seeded REVIEW → re-evaluation example", icon: "decision" as const, section: "Learn" },
];

export function isProductRouteActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

export function productBreadcrumbs(pathname: string) {
  if (pathname === "/dashboard") return ["Overview"];
  const item = productNavigation
    .flatMap((section) => section.items)
    .find((entry) => isProductRouteActive(pathname, entry.href));
  if (!item) return ["Workspace"];

  const crumbs = [item.label];
  if (pathname !== item.href) crumbs.push("Detail");
  return crumbs;
}

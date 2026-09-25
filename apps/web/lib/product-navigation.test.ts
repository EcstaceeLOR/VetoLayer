import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isProductRouteActive, productBreadcrumbs, productCommands, productNavigation } from "./product-navigation";

describe("product navigation", () => {
  it("keeps navigation destinations unique and grouped", () => {
    const items = productNavigation.flatMap((section) => section.items);
    const hrefs = items.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(productNavigation.map((section) => section.label)).toEqual(["Operate", "Configure"]);
  });

  it("resolves active routes without making overview match every dashboard route", () => {
    expect(isProductRouteActive("/dashboard", "/dashboard")).toBe(true);
    expect(isProductRouteActive("/dashboard/decisions", "/dashboard")).toBe(false);
    expect(isProductRouteActive("/dashboard/decisions/receipt-1", "/dashboard/decisions")).toBe(true);
  });

  it("creates useful breadcrumbs for product details", () => {
    expect(productBreadcrumbs("/dashboard")).toEqual(["Overview"]);
    expect(productBreadcrumbs("/dashboard/reviews")).toEqual(["Reviews"]);
    expect(productBreadcrumbs("/dashboard/decisions/receipt-1")).toEqual(["Decisions", "Detail"]);
  });

  it("makes every command point to a real product destination", () => {
    expect(productCommands.length).toBeGreaterThan(5);
    expect(productCommands.every((command) => command.href.startsWith("/"))).toBe(true);
  });

  it("does not reintroduce the old fake project label in the authenticated shell", () => {
    const shell = readFileSync(new URL("../app/dashboard/layout.tsx", import.meta.url), "utf8");
    expect(shell).not.toContain("Production Gate");
    expect(shell).toContain("WorkspaceProjectContext");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativeFromRepo: string) {
  return readFileSync(new URL(`../../../${relativeFromRepo}`, import.meta.url), "utf8");
}

describe("final production QA contracts", () => {
  it("keeps seeded dashboard fixtures out of production", () => {
    const source = read("apps/web/lib/dashboard-data.ts");
    expect(source).toContain('process.env.NODE_ENV === "production" ? []');
  });

  it("runs the browser review journey through the production review orchestrator instead of the demo API", () => {
    const bootstrap = read("scripts/browser-e2e-bootstrap.mjs");
    const reliabilityRoute = read("apps/web/app/api/internal/reliability/session/route.ts");
    expect(bootstrap).toContain('action: "review_journey"');
    expect(bootstrap).toContain("real Human Review re-evaluation creates a new immutable receipt");
    expect(reliabilityRoute).toContain("reevaluateReviewCase");
    expect(reliabilityRoute).toContain('action === "review_journey"');
  });

  it("fails browser QA on console errors and checks all primary dashboard surfaces", () => {
    const bootstrap = read("scripts/browser-e2e-bootstrap.mjs");
    expect(bootstrap).toContain('line.startsWith("console-error:")');
    for (const route of [
      "/dashboard/analytics",
      "/dashboard/decisions",
      "/dashboard/policies",
      "/dashboard/reviews",
      "/dashboard/integrations",
      "/dashboard/developers",
      "/dashboard/notifications",
      "/dashboard/settings",
      "/dashboard/audit",
      "/dashboard/billing",
      "/dashboard/data",
      "/dashboard/docs",
    ]) expect(bootstrap).toContain(route);
  });

  it("keeps the production audit log fail-closed while allowing the isolated browser reliability environment", () => {
    const auditRoute = read("apps/web/app/api/audit/route.ts");
    const reliabilityMode = read("apps/web/lib/server/reliability-mode.ts");
    expect(auditRoute).toContain('persistence !== "supabase" && !isReliabilityTestMode()');
    expect(reliabilityMode).toContain('env.CI === "true"');
    expect(reliabilityMode).toContain('env.VETOLAYER_E2E_MODE === "1"');
    expect(reliabilityMode).toContain('env.VERCEL_ENV !== "production"');
  });

  it("ships a global branded 404 and a completed QA checklist", () => {
    const notFound = read("apps/web/app/not-found.tsx");
    const checklist = read("docs/product-qa-2026-09.md");
    expect(notFound).toContain("This VetoLayer page does not exist.");
    expect(notFound).toContain("Return to control center");
    expect(checklist).toContain("# VetoLayer production QA — 2026.09");
    expect(checklist).not.toContain("- [ ]");
  });
});

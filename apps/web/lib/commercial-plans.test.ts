import { describe, expect, it } from "vitest";
import { COMMERCIAL_PLAN_ORDER, COMMERCIAL_PLANS, canConsume, formatCommercialLimit, usageState } from "./commercial-plans";

describe("commercial plans", () => {
  it("publishes an ordered free-to-scale model without fake checkout state", () => {
    expect(COMMERCIAL_PLAN_ORDER).toEqual(["developer", "team", "scale"]);
    expect(COMMERCIAL_PLANS.developer.priceLabel).toContain("$0");
    expect(COMMERCIAL_PLANS.team.priceLabel).toContain("$49");
    expect(COMMERCIAL_PLANS.scale.priceLabel).toBe("Custom");
  });

  it("increases hard capacity between developer and team", () => {
    expect(COMMERCIAL_PLANS.team.limits.projects).toBeGreaterThan(COMMERCIAL_PLANS.developer.limits.projects as number);
    expect(COMMERCIAL_PLANS.team.limits.members).toBeGreaterThan(COMMERCIAL_PLANS.developer.limits.members as number);
    expect(COMMERCIAL_PLANS.team.limits.decisionsPerMonth).toBeGreaterThan(COMMERCIAL_PLANS.developer.limits.decisionsPerMonth as number);
  });

  it("treats null limits as unlimited and warns near finite capacity", () => {
    expect(canConsume(999_999, 1, null)).toBe(true);
    expect(canConsume(4, 1, 5)).toBe(true);
    expect(canConsume(5, 1, 5)).toBe(false);
    expect(usageState(4, 5)).toBe("warning");
    expect(usageState(5, 5)).toBe("limit");
    expect(usageState(1, null)).toBe("unlimited");
    expect(formatCommercialLimit(null)).toBe("Unlimited");
  });
});

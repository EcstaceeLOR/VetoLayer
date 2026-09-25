import { describe, expect, it } from "vitest";
import { buildOnboardingPolicyPack, buildOnboardingTestInput } from "./onboarding-policies";

const useCases = ["coding", "support", "finance"] as const;

describe("onboarding policy packs", () => {
  for (const useCase of useCases) {
    it(`${useCase} includes deterministic enforcement and contextual SERV judgment`, () => {
      const policies = buildOnboardingPolicyPack(useCase, "Production");
      expect(policies.some((policy) => policy.mode === "deterministic")).toBe(true);
      expect(policies.some((policy) => policy.mode === "contextual")).toBe(true);
      expect(policies.every((policy) => policy.scope?.environments?.includes("Production"))).toBe(true);
    });
  }

  it("builds a fresh scoped coding action from operator input", () => {
    const now = new Date("2026-09-25T05:00:00.000Z");
    const result = buildOnboardingTestInput({
      useCase: "coding",
      integration: "developer-api",
      environmentName: "Production",
      target: "identity-api",
      reason: "Deploy the reviewed session fix.",
      now,
    });

    expect(result.action.id).toContain(String(now.getTime()));
    expect(result.action.action.type).toBe("source-control");
    expect(result.action.action.tool).toBe("vetolayer-api");
    expect(result.action.target.environment).toBe("Production");
    expect(result.action.requestedAt).toBe(now.toISOString());
    expect(result.evidence).toHaveLength(1);
    expect(result.facts.protectedTarget).toBe(true);
  });

  it("keeps support and finance test actions aligned with their selected use case", () => {
    const now = new Date("2026-09-25T05:00:00.000Z");
    const support = buildOnboardingTestInput({
      useCase: "support",
      integration: "github",
      environmentName: "Staging",
      target: "customer-1042",
      reason: "Issue the approved service recovery credit.",
      now,
    });
    const finance = buildOnboardingTestInput({
      useCase: "finance",
      integration: "developer-api",
      environmentName: "Production",
      target: "vendor-northstar",
      reason: "Pay the approved invoice for completed work.",
      now,
    });

    expect(support.action.action.type).toBe("customer-support");
    expect(support.action.action.tool).toBe("github");
    expect(finance.action.action.type).toBe("finance");
    expect(finance.facts.amount).toBe(750);
  });
});

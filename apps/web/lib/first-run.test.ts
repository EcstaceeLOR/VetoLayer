import { describe, expect, it } from "vitest";
import { buildFirstRunGuide } from "./first-run";

describe("first-run guide", () => {
  it("starts with all activation steps incomplete", () => {
    const guide = buildFirstRunGuide({ policyCount: 0, integrationReady: false, decisionCount: 0 });
    expect(guide.complete).toBe(false);
    expect(guide.completedCount).toBe(0);
    expect(guide.steps.every((step) => step.complete === false)).toBe(true);
  });

  it("tracks partial progress without treating the workspace as activated", () => {
    const guide = buildFirstRunGuide({ policyCount: 1, integrationReady: true, decisionCount: 0 });
    expect(guide.complete).toBe(false);
    expect(guide.completedCount).toBe(2);
    expect(guide.steps.map((step) => [step.id, step.complete])).toEqual([
      ["policy", true],
      ["integration", true],
      ["decision", false],
    ]);
  });

  it("completes only after policy, integration, and decision activation", () => {
    const guide = buildFirstRunGuide({ policyCount: 2, integrationReady: true, decisionCount: 4 });
    expect(guide.complete).toBe(true);
    expect(guide.completedCount).toBe(3);
  });
});

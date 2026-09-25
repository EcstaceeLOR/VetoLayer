import { describe, expect, it } from "vitest";
import { buildOnboardingSteps, resolveOnboardingResumeStep } from "./onboarding-progress";

describe("operational onboarding progress", () => {
  it("only completes checkpoints backed by validated product state", () => {
    const steps = buildOnboardingSteps({
      workspace: true,
      project: true,
      environment: true,
      integration: false,
      policy: false,
      serv: false,
      test: false,
      receipt: false,
    });

    expect(steps.filter((step) => step.complete).map((step) => step.key)).toEqual([
      "workspace",
      "project",
      "environment",
    ]);
    expect(steps.find((step) => step.key === "receipt")?.complete).toBe(false);
  });

  it("does not let a saved future step skip an incomplete prerequisite", () => {
    const steps = buildOnboardingSteps({
      workspace: true,
      project: true,
      environment: true,
      integration: false,
      policy: true,
      serv: true,
      test: false,
      receipt: false,
    });

    expect(resolveOnboardingResumeStep(steps, 7)).toBe(4);
  });

  it("resumes the saved step when every earlier checkpoint is still valid", () => {
    const steps = buildOnboardingSteps({
      workspace: true,
      project: true,
      environment: true,
      integration: true,
      policy: true,
      serv: true,
      test: false,
      receipt: false,
    });

    expect(resolveOnboardingResumeStep(steps, 7)).toBe(7);
    expect(resolveOnboardingResumeStep(steps, 8)).toBe(7);
  });

  it("lands on the receipt checkpoint after all eight validations pass", () => {
    const steps = buildOnboardingSteps({
      workspace: true,
      project: true,
      environment: true,
      integration: true,
      policy: true,
      serv: true,
      test: true,
      receipt: true,
    });

    expect(resolveOnboardingResumeStep(steps, 5, true)).toBe(8);
    expect(steps.every((step) => step.complete)).toBe(true);
  });
});

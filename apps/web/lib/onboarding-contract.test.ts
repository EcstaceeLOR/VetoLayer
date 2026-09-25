import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("operational onboarding integration contract", () => {
  it("uses the real decision pipeline and requires live SERV before completion", () => {
    const route = source("../app/api/onboarding/test/route.ts");
    expect(route).toContain("evaluateAction");
    expect(route).toContain("evaluateDeterministicPolicies");
    expect(route).toContain("evaluateWithServ");
    expect(route).toContain("createDecisionReceipt");
    expect(route).toContain('providerStatus === "ok"');
    expect(route).toContain("SERV_LIVE_CHECK_FAILED");
  });

  it("cannot satisfy receipt completion with seeded demo history", () => {
    const progress = source("./server/onboarding-progress.ts");
    expect(progress).toContain('record.source !== "demo"');
    expect(progress).toContain("record.projectId === scope.projectId");
    expect(progress).toContain("record.environmentId === scope.environmentId");
  });

  it("persists policy setup instead of treating a UI selection as completion", () => {
    const route = source("../app/api/onboarding/policy-pack/route.ts");
    expect(route).toContain("policyStore.save");
    expect(route).toContain("CONTEXTUAL_POLICY_REQUIRED");
    expect(route).toContain("policyIds");
  });

  it("keeps restart non-destructive and exposes the full eight-step product journey", () => {
    const stateRoute = source("../app/api/onboarding/route.ts");
    const flow = source("../components/onboarding-flow.tsx");
    expect(stateRoute).toContain("store.clear(identity.userId)");
    expect(stateRoute).not.toContain("clearDemo");
    expect(flow).toContain("Step {step} of 8");
    expect(flow).toContain("Inspect Decision Receipt");
    expect(flow).toContain("Open policy pack");
    expect(flow).toContain("Open integration");
    expect(flow).toContain("Decision stream");
  });
});

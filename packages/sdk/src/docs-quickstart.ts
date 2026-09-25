import { exampleActionRequests } from "@vetolayer/core";
import { createVetoLayerClient } from "./index";

/**
 * Compile-checked source for the Developer Quickstart documentation.
 * This function is intentionally not invoked by the package.
 */
export async function documentedQuickstartExample() {
  const veto = createVetoLayerClient({
    baseUrl: process.env.VETOLAYER_URL ?? "https://vetolayer.example",
    apiKey: process.env.VETOLAYER_PROJECT_API_KEY ?? "vl_live_example",
  });

  const evaluation = await veto.evaluate({
    action: exampleActionRequests.refund,
    evidence: [],
    facts: { customerRisk: "normal" },
  });

  if (evaluation.decision.outcome !== "ALLOW") return evaluation;

  return evaluation;
}

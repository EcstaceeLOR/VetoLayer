import { NextResponse } from "next/server";
import { runFlagshipDemo, type DemoStage } from "../../../../lib/flagship-demo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let stage: DemoStage;
  try {
    const body = (await request.json()) as { stage?: string };
    if (body.stage !== "needs-approval" && body.stage !== "resolved") {
      return NextResponse.json(
        { error: "stage must be needs-approval or resolved" },
        { status: 400 },
      );
    }
    stage = body.stage;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const result = await runFlagshipDemo(stage, { now: new Date() });

  return NextResponse.json({
    stage,
    outcome: result.orchestration.decision.outcome,
    summary: result.orchestration.decision.summary,
    deterministicFindings: result.orchestration.decision.deterministicFindings,
    contextualFindings: result.orchestration.decision.contextualFindings,
    requirementsToChangeOutcome: result.receipt.requirementsToChangeOutcome,
    trace: result.orchestration.trace,
    providerTrace: result.orchestration.contextualTrace,
    receipt: result.receipt,
  });
}

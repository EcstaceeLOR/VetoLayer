import { ActionRequestSchema, EvidenceSchema, PolicySchema, evaluateAction, type JsonValue } from "@vetolayer/core";
import { evaluateDeterministicPolicies } from "@vetolayer/policies";
import { evaluateWithServ, readServEnvironment } from "@vetolayer/serv";
import { NextResponse } from "next/server";
import { policyStudioSampleAction, policyStudioSampleEvidence, policyStudioSampleFacts } from "../../../../lib/policy-studio";
import { requireApiWorkspace } from "../../../../lib/server/api-auth";

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("policies.read");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "INVALID_JSON", message: "Simulation request must be valid JSON." }, { status: 400 }); }
  const policy = PolicySchema.safeParse(body.policy);
  if (!policy.success) return NextResponse.json({ error: "INVALID_POLICY", issues: policy.error.issues }, { status: 400 });
  const action = body.action === undefined ? { success: true as const, data: policyStudioSampleAction } : ActionRequestSchema.safeParse(body.action);
  if (!action.success) return NextResponse.json({ error: "INVALID_ACTION", issues: action.error.issues }, { status: 400 });
  const evidenceInput = body.evidence === undefined ? policyStudioSampleEvidence : body.evidence;
  if (!Array.isArray(evidenceInput)) return NextResponse.json({ error: "INVALID_EVIDENCE", message: "evidence must be an array." }, { status: 400 });
  const evidence = evidenceInput.map((item) => EvidenceSchema.safeParse(item));
  const invalidEvidence = evidence.find((item) => !item.success);
  if (invalidEvidence && !invalidEvidence.success) return NextResponse.json({ error: "INVALID_EVIDENCE", issues: invalidEvidence.error.issues }, { status: 400 });
  const facts = isJsonRecord(body.facts) ? body.facts : policyStudioSampleFacts;

  const result = await evaluateAction({
    action: action.data,
    policies: [policy.data],
    evidence: evidence.map((item) => item.success ? item.data : neverEvidence()),
    facts,
    environment: {
      source: "policy-studio",
      sample: true,
      workspaceId: auth.workspace.workspaceId,
      projectId: auth.workspace.projectId,
      environmentId: auth.workspace.environmentId,
      environmentName: auth.workspace.environment.name,
      incident: { id: "INC-2041", severity: "critical", active: true, summary: "Active session-token replay vulnerability; proposed patch directly remediates the exposure." },
    },
    now: new Date("2026-09-24T14:00:00.000Z"),
    decisionId: `studio_${policy.data.id}`,
  }, {
    evaluateDeterministic: (input) => evaluateDeterministicPolicies(input),
    evaluateContextual: (input) => evaluateWithServ(input, readServEnvironment()),
  });

  return NextResponse.json({
    outcome: result.decision.outcome,
    summary: result.decision.summary,
    deterministicFindings: result.decision.deterministicFindings,
    contextualFindings: result.decision.contextualFindings,
    missingEvidence: result.decision.missingEvidence,
    contradictions: result.decision.contradictoryEvidence,
    trace: result.trace,
    provider: result.contextualTrace ?? null,
    scope: { workspaceId: auth.workspace.workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId },
  });
}

function isJsonRecord(value: unknown): value is Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(isJsonValue);
}
function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isJsonValue);
  return false;
}
function neverEvidence(): never { throw new Error("Unreachable invalid evidence state."); }

import { ActionRequestSchema, EvidenceSchema, PolicySchema, evaluateAction, type DecisionReceipt, type JsonValue } from "@vetolayer/core";
import { evaluateDeterministicPolicies } from "@vetolayer/policies";
import { evaluateWithServ, readServEnvironment } from "@vetolayer/serv";
import { NextResponse } from "next/server";
import { policyStudioSampleAction, policyStudioSampleEvidence, policyStudioSampleFacts } from "../../../../lib/policy-studio";
import { requireApiWorkspace } from "../../../../lib/server/api-auth";
import { getDecisionStore } from "../../../../lib/server/decision-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("policies.read");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "INVALID_JSON", message: "Simulation request must be valid JSON." }, { status: 400 }); }
  const policy = PolicySchema.safeParse(body.policy);
  if (!policy.success) return NextResponse.json({ error: "INVALID_POLICY", issues: policy.error.issues }, { status: 400 });

  let source: "sample" | "historical" = "sample";
  let historicalReceiptId: string | undefined;
  let actionInput: unknown = body.action;
  let evidenceInput: unknown = body.evidence;
  let defaultFacts: Record<string, JsonValue> = policyStudioSampleFacts;
  let historicalLimitations: string[] = [];

  if (typeof body.historicalReceiptId === "string" && body.historicalReceiptId.trim()) {
    source = "historical";
    historicalReceiptId = body.historicalReceiptId.trim();
    const { store } = getDecisionStore();
    const record = await store.get(auth.workspace.workspaceId, historicalReceiptId).catch(() => null);
    if (!record || record.projectId !== auth.workspace.projectId || record.environmentId !== auth.workspace.environmentId) {
      return NextResponse.json({ error: "HISTORICAL_DECISION_NOT_FOUND", message: "That historical receipt is not available in the selected project and environment." }, { status: 404 });
    }
    actionInput = historicalAction(record.receipt);
    evidenceInput = record.receipt.evidenceUsed;
    defaultFacts = historicalFacts(record.receipt);
    historicalLimitations = [
      "The Decision Receipt preserves the governed action identity and evidence, but not every arbitrary caller-supplied fact from the original request.",
      "Simulation derives common facts from preserved evidence and may therefore be more conservative than the original evaluation.",
    ];
  }

  const action = actionInput === undefined ? { success: true as const, data: policyStudioSampleAction } : ActionRequestSchema.safeParse(actionInput);
  if (!action.success) return NextResponse.json({ error: "INVALID_ACTION", issues: action.error.issues }, { status: 400 });
  const resolvedEvidenceInput = evidenceInput === undefined ? policyStudioSampleEvidence : evidenceInput;
  if (!Array.isArray(resolvedEvidenceInput)) return NextResponse.json({ error: "INVALID_EVIDENCE", message: "evidence must be an array." }, { status: 400 });
  const evidence = resolvedEvidenceInput.map((item) => EvidenceSchema.safeParse(item));
  const invalidEvidence = evidence.find((item) => !item.success);
  if (invalidEvidence && !invalidEvidence.success) return NextResponse.json({ error: "INVALID_EVIDENCE", issues: invalidEvidence.error.issues }, { status: 400 });
  const facts = isJsonRecord(body.facts) ? body.facts : defaultFacts;

  const result = await evaluateAction({
    action: action.data,
    policies: [{ ...policy.data, enabled: true }],
    evidence: evidence.map((item) => item.success ? item.data : neverEvidence()),
    facts,
    environment: {
      source: "policy-studio",
      simulationSource: source,
      workspaceId: auth.workspace.workspaceId,
      projectId: auth.workspace.projectId,
      environmentId: auth.workspace.environmentId,
      environmentName: auth.workspace.environment.name,
      ...(historicalReceiptId ? { historicalReceiptId } : {}),
      incident: { id: "INC-2041", severity: "critical", active: true, summary: "Policy Studio simulation context." },
    },
    now: source === "sample" ? new Date("2026-09-24T14:00:00.000Z") : new Date(),
    decisionId: `studio_${policy.data.id}_${Date.now()}`,
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
    simulationSource: source,
    ...(historicalReceiptId ? { historicalReceiptId, historicalLimitations } : {}),
    scope: { workspaceId: auth.workspace.workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId },
  });
}

function historicalAction(receipt: DecisionReceipt) {
  return {
    id: `policy_simulation_${receipt.receiptId}`,
    actor: receipt.actor,
    action: {
      type: receipt.action.type,
      tool: receipt.action.tool,
      operation: receipt.action.operation,
      arguments: { historicalReceiptId: receipt.receiptId },
    },
    target: {
      type: receipt.action.targetType,
      ...(receipt.action.targetId ? { id: receipt.action.targetId } : {}),
      ...(receipt.action.environment ? { environment: receipt.action.environment } : {}),
    },
    context: {
      source: "policy-studio-history",
      ...(receipt.action.environment ? { environment: receipt.action.environment } : {}),
      correlationId: receipt.receiptId,
    },
    requestedAt: receipt.timestamps.requestedAt,
  };
}

function historicalFacts(receipt: DecisionReceipt): Record<string, JsonValue> {
  const facts: Record<string, JsonValue> = {
    historicalOutcome: receipt.outcome,
    evidenceCount: receipt.evidenceUsed.length,
  };
  for (const evidence of receipt.evidenceUsed) {
    if (!evidence.data || typeof evidence.data !== "object" || Array.isArray(evidence.data)) continue;
    const data = evidence.data as Record<string, JsonValue>;
    if (evidence.type === "review-approval" && typeof data.count === "number") facts.approvalCount = data.count;
    if (evidence.type === "ci-status" && typeof data.passed === "boolean") facts.ciPassed = data.passed;
    if (evidence.type === "changed-files" && Array.isArray(data.sensitiveFiles)) facts.sensitiveChange = data.sensitiveFiles.length > 0;
  }
  return facts;
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

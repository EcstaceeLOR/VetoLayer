import { z } from "zod";
import type { DecisionOrchestrationResult } from "./orchestrator";
import {
  ActorSchema,
  EvidenceContradictionSchema,
  EvidenceRequirementSchema,
  EvidenceSchema,
  FindingSchema,
  type ActionRequest,
  type Evidence,
  type Policy,
} from "./schemas";

export const DECISION_RECEIPT_SCHEMA_VERSION = "1.0.0" as const;
export const ORCHESTRATOR_VERSION = "1.0.0" as const;

const PolicyReceiptSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    mode: z.enum(["deterministic", "contextual"]),
    severity: z.enum(["low", "medium", "high", "critical"]),
    priority: z.number().int(),
    exceptions: z.array(
      z
        .object({
          id: z.string().min(1),
          description: z.string().min(1),
          criteria: z.array(z.string()),
          requiredEvidence: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();

const TraceStepSchema = z
  .object({
    step: z.enum([
      "policy-resolution",
      "deterministic-evaluation",
      "contextual-evaluation",
      "decision-combination",
    ]),
    status: z.enum(["completed", "skipped", "fallback"]),
    summary: z.string().min(1),
    policyIds: z.array(z.string()).optional(),
  })
  .strict();

const ExceptionPathSchema = z
  .object({
    policyId: z.string().min(1),
    policyName: z.string().min(1),
    exceptionId: z.string().min(1),
    description: z.string().min(1),
    criteria: z.array(z.string()),
    requiredEvidence: z.array(z.string()),
    relatedFindingSummaries: z.array(z.string()),
  })
  .strict();

export const DecisionReceiptContentSchema = z
  .object({
    schemaVersion: z.literal(DECISION_RECEIPT_SCHEMA_VERSION),
    receiptId: z.string().min(1),
    decisionId: z.string().min(1),
    action: z
      .object({
        requestId: z.string().min(1),
        type: z.string().min(1),
        tool: z.string().min(1),
        operation: z.string().min(1),
        targetType: z.string().min(1),
        targetId: z.string().optional(),
        environment: z.string().optional(),
      })
      .strict(),
    actor: ActorSchema,
    outcome: z.enum(["ALLOW", "REVIEW", "BLOCK"]),
    decisionSummary: z.string().min(1),
    policiesEvaluated: z.array(PolicyReceiptSchema),
    deterministicFindings: z.array(FindingSchema),
    contextualFindings: z.array(FindingSchema),
    evidenceUsed: z.array(EvidenceSchema),
    missingEvidence: z.array(EvidenceRequirementSchema),
    contradictoryEvidence: z.array(EvidenceContradictionSchema),
    exceptionPath: z.array(ExceptionPathSchema),
    requirementsToChangeOutcome: z.array(z.string()),
    timestamps: z
      .object({
        requestedAt: z.string().min(1),
        decidedAt: z.string().min(1),
        receiptCreatedAt: z.string().min(1),
      })
      .strict(),
    trace: z.array(TraceStepSchema),
    providerTrace: z.record(z.string(), z.unknown()).optional(),
    versions: z
      .object({
        receiptSchema: z.literal(DECISION_RECEIPT_SCHEMA_VERSION),
        orchestrator: z.literal(ORCHESTRATOR_VERSION),
      })
      .strict(),
  })
  .strict();

export const DecisionReceiptSchema = DecisionReceiptContentSchema.extend({
  integrity: z
    .object({
      algorithm: z.literal("SHA-256"),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
}).strict();

export type DecisionReceiptContent = z.infer<typeof DecisionReceiptContentSchema>;
export type DecisionReceipt = z.infer<typeof DecisionReceiptSchema>;

export async function createDecisionReceipt(input: {
  orchestration: DecisionOrchestrationResult;
  action: ActionRequest;
  policies: Policy[];
  evidence?: Evidence[];
  createdAt?: Date;
  receiptId?: string;
}): Promise<DecisionReceipt> {
  const { decision } = input.orchestration;
  const evidence = input.evidence ?? [];
  const createdAt = input.createdAt ?? new Date();
  const policiesEvaluated = input.policies
    .filter((policy) => decision.appliedPolicyIds.includes(policy.id))
    .map((policy) => ({
      id: policy.id,
      name: policy.name,
      mode: policy.mode,
      severity: policy.severity,
      priority: policy.priority,
      exceptions: policy.exceptions.map((exception) => ({
        id: exception.id,
        description: exception.description,
        criteria: exception.criteria,
        requiredEvidence: exception.requiredEvidence,
      })),
    }));

  const evidenceIds = collectUsedEvidenceIds(decision);
  const evidenceUsed = evidence.filter((item) => evidenceIds.has(item.id));

  const content: DecisionReceiptContent = {
    schemaVersion: DECISION_RECEIPT_SCHEMA_VERSION,
    receiptId: input.receiptId ?? `receipt_${decision.id}`,
    decisionId: decision.id,
    action: {
      requestId: input.action.id,
      type: input.action.action.type,
      tool: input.action.action.tool,
      operation: input.action.action.operation,
      targetType: input.action.target.type,
      ...(input.action.target.id ? { targetId: input.action.target.id } : {}),
      ...((input.action.target.environment ?? input.action.context.environment)
        ? { environment: input.action.target.environment ?? input.action.context.environment }
        : {}),
    },
    actor: input.action.actor,
    outcome: decision.outcome,
    decisionSummary: decision.summary,
    policiesEvaluated,
    deterministicFindings: decision.deterministicFindings,
    contextualFindings: decision.contextualFindings,
    evidenceUsed,
    missingEvidence: decision.missingEvidence,
    contradictoryEvidence: decision.contradictoryEvidence,
    exceptionPath: buildExceptionPath(input.policies, decision),
    requirementsToChangeOutcome: buildRequirementsToChangeOutcome(decision),
    timestamps: {
      requestedAt: input.action.requestedAt,
      decidedAt: decision.decidedAt,
      receiptCreatedAt: createdAt.toISOString(),
    },
    trace: input.orchestration.trace,
    ...(input.orchestration.contextualTrace
      ? { providerTrace: input.orchestration.contextualTrace }
      : {}),
    versions: {
      receiptSchema: DECISION_RECEIPT_SCHEMA_VERSION,
      orchestrator: ORCHESTRATOR_VERSION,
    },
  };

  const validatedContent = DecisionReceiptContentSchema.parse(content);
  const hash = await sha256(canonicalJson(validatedContent));

  return DecisionReceiptSchema.parse({
    ...validatedContent,
    integrity: {
      algorithm: "SHA-256",
      hash,
    },
  });
}

export async function verifyDecisionReceipt(receipt: DecisionReceipt): Promise<boolean> {
  const parsed = DecisionReceiptSchema.safeParse(receipt);
  if (!parsed.success) return false;

  const { integrity, ...content } = parsed.data;
  const expected = await sha256(canonicalJson(content));
  return expected === integrity.hash;
}

export function renderDecisionReceiptSummary(receipt: DecisionReceipt): string {
  const lines = [
    `VetoLayer Decision Receipt ${receipt.receiptId}`,
    `Outcome: ${receipt.outcome}`,
    `Action: ${receipt.action.tool}.${receipt.action.operation} (${receipt.action.type})`,
    `Actor: ${receipt.actor.name ?? receipt.actor.id} [${receipt.actor.kind}]`,
    `Decision: ${receipt.decisionSummary}`,
    `Policies evaluated: ${receipt.policiesEvaluated.map((policy) => policy.name).join(", ") || "none"}`,
    `Evidence used: ${receipt.evidenceUsed.map((item) => item.id).join(", ") || "none"}`,
  ];

  if (receipt.missingEvidence.length > 0) {
    lines.push(
      `Missing evidence: ${receipt.missingEvidence
        .map((item) => item.description)
        .join("; ")}`,
    );
  }

  if (receipt.requirementsToChangeOutcome.length > 0) {
    lines.push(
      `What would need to change: ${receipt.requirementsToChangeOutcome.join("; ")}`,
    );
  }

  lines.push(`Integrity: SHA-256 ${receipt.integrity.hash}`);
  return lines.join("\n");
}

export function decisionReceiptToJson(
  receipt: DecisionReceipt,
  pretty = true,
): string {
  return JSON.stringify(receipt, null, pretty ? 2 : 0);
}

function collectUsedEvidenceIds(decision: DecisionOrchestrationResult["decision"]): Set<string> {
  const ids = new Set<string>();

  for (const finding of [
    ...decision.deterministicFindings,
    ...decision.contextualFindings,
  ]) {
    for (const id of finding.evidenceIds) ids.add(id);
  }

  for (const contradiction of decision.contradictoryEvidence) {
    for (const id of contradiction.evidenceIds) ids.add(id);
  }

  return ids;
}

function buildExceptionPath(
  policies: Policy[],
  decision: DecisionOrchestrationResult["decision"],
): DecisionReceiptContent["exceptionPath"] {
  const findingSummaries = [...decision.deterministicFindings, ...decision.contextualFindings];

  return policies
    .filter(
      (policy) =>
        decision.appliedPolicyIds.includes(policy.id) && policy.exceptions.length > 0,
    )
    .flatMap((policy) =>
      policy.exceptions.map((exception) => ({
        policyId: policy.id,
        policyName: policy.name,
        exceptionId: exception.id,
        description: exception.description,
        criteria: exception.criteria,
        requiredEvidence: exception.requiredEvidence,
        relatedFindingSummaries: findingSummaries
          .filter((finding) => finding.policyId === policy.id)
          .map((finding) => finding.summary),
      })),
    );
}

function buildRequirementsToChangeOutcome(
  decision: DecisionOrchestrationResult["decision"],
): string[] {
  const requirements = new Set<string>();

  for (const missing of decision.missingEvidence) {
    requirements.add(`Provide ${missing.description}.`);
  }

  for (const finding of [
    ...decision.deterministicFindings,
    ...decision.contextualFindings,
  ]) {
    if (finding.status === "fail" || finding.status === "uncertain") {
      requirements.add(`Resolve policy ${finding.policyId}: ${finding.summary}`);
    }
  }

  for (const contradiction of decision.contradictoryEvidence) {
    requirements.add(`Resolve conflicting evidence: ${contradiction.description}`);
  }

  return [...requirements];
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortRecursively(value));
}

function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortRecursively);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortRecursively(child)]),
    );
  }

  return value;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

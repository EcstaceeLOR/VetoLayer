import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const MetadataSchema = z.record(z.string(), JsonValueSchema);
const IdSchema = z.string().trim().min(1).max(200);
const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const ActorSchema = z
  .object({
    id: IdSchema,
    kind: z.enum(["agent", "human", "service"]),
    name: z.string().trim().min(1).max(160).optional(),
    framework: z.string().trim().min(1).max(120).optional(),
    metadata: MetadataSchema.optional(),
  })
  .strict();

export const TargetResourceSchema = z
  .object({
    type: z.string().trim().min(1).max(120),
    id: IdSchema.optional(),
    environment: z.string().trim().min(1).max(80).optional(),
    metadata: MetadataSchema.optional(),
  })
  .strict();

export const ActionContextSchema = z
  .object({
    source: z.string().trim().min(1).max(120).optional(),
    correlationId: IdSchema.optional(),
    environment: z.string().trim().min(1).max(80).optional(),
    attributes: MetadataSchema.optional(),
  })
  .strict();

export const ActionRequestSchema = z
  .object({
    id: IdSchema,
    actor: ActorSchema,
    action: z
      .object({
        type: z.string().trim().min(1).max(120),
        tool: z.string().trim().min(1).max(120),
        operation: z.string().trim().min(1).max(160),
        arguments: JsonValueSchema,
      })
      .strict(),
    target: TargetResourceSchema,
    context: ActionContextSchema.default({}),
    requestedAt: IsoDateTimeSchema,
  })
  .strict();

export const EvidenceVerificationSchema = z
  .object({
    status: z.enum(["verified", "unverified", "failed"]),
    verifier: z.string().trim().min(1).max(160).optional(),
    verifiedAt: IsoDateTimeSchema.optional(),
    details: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export const EvidenceSourceSchema = z
  .object({
    kind: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(200).optional(),
    uri: z.url().optional(),
  })
  .strict();

export const EvidenceSchema = z
  .object({
    id: IdSchema,
    type: z.string().trim().min(1).max(120),
    source: EvidenceSourceSchema,
    data: JsonValueSchema.optional(),
    reference: z.string().trim().min(1).max(2_000).optional(),
    observedAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema.optional(),
    verification: EvidenceVerificationSchema,
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .refine((evidence) => evidence.data !== undefined || evidence.reference !== undefined, {
    message: "Evidence must contain data or a reference",
    path: ["data"],
  });

export const EvidenceRequirementSchema = z
  .object({
    key: IdSchema,
    type: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    required: z.boolean(),
    maxAgeSeconds: z.number().int().positive().optional(),
  })
  .strict();

export const PolicyExceptionSchema = z
  .object({
    id: IdSchema,
    description: z.string().trim().min(1).max(1_000),
    criteria: z.array(z.string().trim().min(1).max(500)).min(1),
    requiredEvidence: z.array(z.string().trim().min(1).max(120)).default([]),
  })
  .strict();

const PolicyBaseSchema = z
  .object({
    id: IdSchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2_000),
    severity: z.enum(["low", "medium", "high", "critical"]),
    priority: z.number().int().min(1).max(1_000),
    enabled: z.boolean(),
    requiredEvidence: z.array(EvidenceRequirementSchema).default([]),
    exceptions: z.array(PolicyExceptionSchema).default([]),
    scope: z
      .object({
        actionTypes: z.array(z.string().trim().min(1)).optional(),
        tools: z.array(z.string().trim().min(1)).optional(),
        environments: z.array(z.string().trim().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const DeterministicConditionSchema = z
  .object({
    field: z.string().trim().min(1).max(240),
    operator: z.enum([
      "equals",
      "not_equals",
      "greater_than",
      "greater_than_or_equal",
      "less_than",
      "less_than_or_equal",
      "in",
      "not_in",
      "exists",
      "not_exists",
    ]),
    value: JsonValueSchema.optional(),
  })
  .strict();

export const DeterministicPolicySchema = PolicyBaseSchema.extend({
  mode: z.literal("deterministic"),
  rule: z
    .object({
      effect: z.enum(["allow", "review", "block"]),
      match: z.enum(["all", "any"]),
      conditions: z.array(DeterministicConditionSchema).min(1),
    })
    .strict(),
}).strict();

export const ContextualPolicySchema = PolicyBaseSchema.extend({
  mode: z.literal("contextual"),
  instruction: z.string().trim().min(1).max(4_000),
  decisionCriteria: z.array(z.string().trim().min(1).max(1_000)).min(1),
}).strict();

export const PolicySchema = z.discriminatedUnion("mode", [
  DeterministicPolicySchema,
  ContextualPolicySchema,
]);

export const FindingSchema = z
  .object({
    id: IdSchema,
    policyId: IdSchema,
    source: z.enum(["deterministic", "contextual"]),
    status: z.enum(["pass", "fail", "uncertain"]),
    severity: z.enum(["low", "medium", "high", "critical"]),
    summary: z.string().trim().min(1).max(2_000),
    evidenceIds: z.array(IdSchema).default([]),
  })
  .strict();

export const EvidenceContradictionSchema = z
  .object({
    evidenceIds: z.array(IdSchema).min(2),
    description: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const DecisionSchema = z
  .object({
    id: IdSchema,
    actionRequestId: IdSchema,
    outcome: z.enum(["ALLOW", "REVIEW", "BLOCK"]),
    deterministicFindings: z.array(FindingSchema),
    contextualFindings: z.array(FindingSchema),
    missingEvidence: z.array(EvidenceRequirementSchema),
    contradictoryEvidence: z.array(EvidenceContradictionSchema),
    appliedPolicyIds: z.array(IdSchema),
    confidence: z.number().min(0).max(1).optional(),
    summary: z.string().trim().min(1).max(4_000),
    decidedAt: IsoDateTimeSchema,
  })
  .strict();

export type Actor = z.infer<typeof ActorSchema>;
export type TargetResource = z.infer<typeof TargetResourceSchema>;
export type ActionContext = z.infer<typeof ActionContextSchema>;
export type ActionRequest = z.infer<typeof ActionRequestSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type EvidenceRequirement = z.infer<typeof EvidenceRequirementSchema>;
export type PolicyException = z.infer<typeof PolicyExceptionSchema>;
export type DeterministicPolicy = z.infer<typeof DeterministicPolicySchema>;
export type ContextualPolicy = z.infer<typeof ContextualPolicySchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type EvidenceContradiction = z.infer<typeof EvidenceContradictionSchema>;
export type Decision = z.infer<typeof DecisionSchema>;

import { z } from "zod";
import type {
  ActionRequest,
  ContextualPolicy,
  Evidence,
  Finding,
} from "@vetolayer/core";

const IdSchema = z.string().trim().min(1).max(200);

export const ServPolicyFindingSchema = z
  .object({
    policyId: IdSchema,
    status: z.enum(["pass", "fail", "uncertain"]),
    summary: z.string().trim().min(1).max(2_000),
    evidenceIds: z.array(IdSchema).default([]),
  })
  .strict();

export const ServMissingEvidenceSchema = z
  .object({
    policyId: IdSchema,
    key: IdSchema,
    description: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const ServContradictionSchema = z
  .object({
    evidenceIds: z.array(IdSchema).min(2),
    description: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const ServExceptionAnalysisSchema = z
  .object({
    policyId: IdSchema,
    exceptionId: IdSchema,
    applies: z.boolean(),
    satisfiedCriteria: z.array(z.string().trim().min(1)).default([]),
    unsatisfiedCriteria: z.array(z.string().trim().min(1)).default([]),
    summary: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const ServReasoningDecisionSchema = z
  .object({
    recommendedOutcome: z.enum(["ALLOW", "REVIEW", "BLOCK"]),
    policyFindings: z.array(ServPolicyFindingSchema),
    evidenceUsed: z.array(IdSchema),
    missingEvidence: z.array(ServMissingEvidenceSchema),
    contradictoryEvidence: z.array(ServContradictionSchema),
    exceptionAnalysis: z.array(ServExceptionAnalysisSchema),
    rationale: z.string().trim().min(1).max(4_000),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export type ServReasoningDecision = z.infer<typeof ServReasoningDecisionSchema>;

export type ServReasoningInput = {
  action: ActionRequest;
  contextualPolicies: ContextualPolicy[];
  deterministicFindings: Finding[];
  evidence: Evidence[];
  environment?: Record<string, unknown>;
};

export type ServTrace = {
  provider: "openserv-serv";
  endpoint: string;
  model: string;
  requestId?: string;
  latencyMs: number;
  receivedAt: string;
  providerStatus: "ok" | "fallback";
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export type ServErrorCode =
  | "CONFIGURATION_ERROR"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "MALFORMED_RESPONSE"
  | "INVALID_REASONING";

export type ServEvaluationResult = {
  decision: ServReasoningDecision;
  trace: ServTrace;
  error?: {
    code: ServErrorCode;
    message: string;
  };
};

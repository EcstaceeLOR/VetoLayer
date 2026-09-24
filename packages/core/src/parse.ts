import type { z } from "zod";
import {
  ActionRequestSchema,
  DecisionSchema,
  EvidenceSchema,
  PolicySchema,
} from "./schemas";

export function parseActionRequest(input: unknown) {
  return ActionRequestSchema.parse(input);
}

export function parseEvidence(input: unknown) {
  return EvidenceSchema.parse(input);
}

export function parsePolicy(input: unknown) {
  return PolicySchema.parse(input);
}

export function parseDecision(input: unknown) {
  return DecisionSchema.parse(input);
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

export function safeParseActionRequest(
  input: unknown,
): ValidationResult<ReturnType<typeof parseActionRequest>> {
  const result = ActionRequestSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

export function safeParseEvidence(
  input: unknown,
): ValidationResult<ReturnType<typeof parseEvidence>> {
  const result = EvidenceSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

export function safeParsePolicy(
  input: unknown,
): ValidationResult<ReturnType<typeof parsePolicy>> {
  const result = PolicySchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

export function safeParseDecision(
  input: unknown,
): ValidationResult<ReturnType<typeof parseDecision>> {
  const result = DecisionSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

import {
  ActionRequestSchema,
  EvidenceSchema,
  PolicySchema,
  type ActionRequest,
  type Evidence,
  type JsonValue,
  type Policy,
} from "@vetolayer/core";
import type { ServerEnvironment } from "./env";

export type DeveloperEvaluationPayload = {
  action: ActionRequest;
  policies: Policy[];
  evidence: Evidence[];
  facts: Record<string, JsonValue>;
  environment: Record<string, JsonValue>;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiAuthorizationFailure = {
  status: 401 | 503;
  body: ApiErrorBody;
};

export function authorizeDeveloperRequest(
  request: Request,
  environment: ServerEnvironment,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): ApiAuthorizationFailure | null {
  if (!environment.apiAuthConfigured || !environment.apiKey) {
    if (nodeEnv !== "production") return null;
    return {
      status: 503,
      body: {
        error: {
          code: "API_AUTH_NOT_CONFIGURED",
          message:
            "The VetoLayer Developer API is disabled until VETOLAYER_API_KEY is configured server-side.",
        },
      },
    };
  }

  const authorization = request.headers.get("authorization");
  if (authorization === `Bearer ${environment.apiKey}`) return null;
  return {
    status: 401,
    body: {
      error: {
        code: "UNAUTHORIZED",
        message: "A valid VetoLayer API bearer token is required.",
      },
    },
  };
}

export function parseDeveloperEvaluationPayload(
  body: unknown,
): { ok: true; data: DeveloperEvaluationPayload } | { ok: false; error: ApiErrorBody } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return invalid("INVALID_REQUEST", "Request body must be a JSON object.");
  }
  const input = body as Record<string, unknown>;
  const action = ActionRequestSchema.safeParse(input.action);
  if (!action.success) return invalid("INVALID_ACTION", "Action Request does not satisfy the VetoLayer contract.", action.error.issues);

  if (!Array.isArray(input.policies) || input.policies.length === 0) {
    return invalid("POLICIES_REQUIRED", "At least one VetoLayer policy is required for evaluation.");
  }
  const policies: Policy[] = [];
  for (const [index, candidate] of input.policies.entries()) {
    const parsed = PolicySchema.safeParse(candidate);
    if (!parsed.success) return invalid("INVALID_POLICY", `Policy at index ${index} is invalid.`, parsed.error.issues);
    policies.push(parsed.data);
  }

  const evidence: Evidence[] = [];
  if (input.evidence !== undefined) {
    if (!Array.isArray(input.evidence)) return invalid("INVALID_EVIDENCE", "evidence must be an array.");
    for (const [index, candidate] of input.evidence.entries()) {
      const parsed = EvidenceSchema.safeParse(candidate);
      if (!parsed.success) return invalid("INVALID_EVIDENCE", `Evidence at index ${index} is invalid.`, parsed.error.issues);
      evidence.push(parsed.data);
    }
  }

  const facts = input.facts === undefined ? {} : parseJsonRecord(input.facts);
  if (!facts) return invalid("INVALID_FACTS", "facts must be a JSON-serializable object.");
  const environment = input.environment === undefined ? {} : parseJsonRecord(input.environment);
  if (!environment) return invalid("INVALID_ENVIRONMENT", "environment must be a JSON-serializable object.");

  return { ok: true, data: { action: action.data, policies, evidence, facts, environment } };
}

function invalid(code: string, message: string, details?: unknown) {
  return {
    ok: false as const,
    error: { error: { code, message, ...(details !== undefined ? { details } : {}) } },
  };
}

function parseJsonRecord(value: unknown): Record<string, JsonValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.every(([, child]) => isJsonValue(child))) return null;
  return Object.fromEntries(entries) as Record<string, JsonValue>;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object" && value !== null && Object.values(value as Record<string, unknown>).every(isJsonValue);
}

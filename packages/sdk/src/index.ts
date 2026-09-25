import type {
  ActionRequest,
  Decision,
  DecisionReceipt,
  Evidence,
  JsonValue,
  Policy,
} from "@vetolayer/core";

export type VetoLayerApiScope = {
  workspaceId: string;
  projectId: string;
  environmentId: string;
};

export type VetoLayerEvaluationRequest = {
  action: ActionRequest;
  policies: Policy[];
  evidence?: Evidence[];
  facts?: Record<string, JsonValue>;
  environment?: Record<string, JsonValue>;
};

export type VetoLayerEvaluationResponse = {
  requestId: string;
  decision: Decision;
  receipt: DecisionReceipt;
  trace: Array<{
    step: string;
    status: string;
    summary: string;
    policyIds?: string[];
  }>;
  providerTrace?: Record<string, unknown>;
  persistence: "supabase" | "memory";
  scope: VetoLayerApiScope;
  latencyMs: number;
};

export type VetoLayerDecisionStatusResponse = {
  status: {
    decisionId: string;
    outcome: "ALLOW" | "REVIEW" | "BLOCK";
    summary: string;
    decidedAt: string;
  };
  receipt: DecisionReceipt;
  source: string;
  createdAt: string;
  scope: VetoLayerApiScope;
  persistence: "supabase" | "memory";
};

export type VetoLayerDecisionListResponse = {
  scope: VetoLayerApiScope;
  count: number;
  decisions: Array<{
    id: string;
    source: string;
    createdAt: string;
    receipt: DecisionReceipt;
  }>;
};

export type VetoLayerApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class VetoLayerApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, body: VetoLayerApiErrorBody) {
    super(body.error.message);
    this.name = "VetoLayerApiError";
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
  }
}

export type VetoLayerClientConfig = {
  baseUrl: string;
  /** Project/environment-scoped secret created in the VetoLayer Developer Console. */
  apiKey?: string;
  fetch?: typeof fetch;
};

export function createVetoLayerClient(config: VetoLayerClientConfig) {
  const fetchImpl = config.fetch ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (config.apiKey) headers.set("Authorization", `Bearer ${config.apiKey}`);

    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    const payload = (await response.json().catch(() => null)) as T | VetoLayerApiErrorBody | null;
    if (!response.ok) {
      const body: VetoLayerApiErrorBody = payload && typeof payload === "object" && "error" in payload
        ? payload as VetoLayerApiErrorBody
        : { error: { code: "HTTP_ERROR", message: `VetoLayer API returned HTTP ${response.status}.` } };
      throw new VetoLayerApiError(response.status, body);
    }
    return payload as T;
  }

  return {
    evaluate(input: VetoLayerEvaluationRequest) {
      return request<VetoLayerEvaluationResponse>("/api/v1/evaluate", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    getDecision(receiptId: string) {
      return request<VetoLayerDecisionStatusResponse>(
        `/api/v1/decisions/${encodeURIComponent(receiptId)}`,
      );
    },

    listDecisions(limit = 50) {
      const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
      return request<VetoLayerDecisionListResponse>(`/api/v1/decisions?limit=${safeLimit}`);
    },
  };
}

/**
 * Convenience wrapper for the common evaluate-before-execute pattern.
 * The tool is called only when VetoLayer returns ALLOW.
 *
 * Scope is derived exclusively from the Developer Console API key. The SDK
 * never sends a caller-selected workspace/project/environment identifier, so
 * a client cannot use headers or request fields to cross product boundaries.
 */
export async function guardedToolCall<T>(input: {
  client: ReturnType<typeof createVetoLayerClient>;
  evaluation: VetoLayerEvaluationRequest;
  execute: () => Promise<T>;
}): Promise<{ evaluation: VetoLayerEvaluationResponse; result?: T }> {
  const evaluation = await input.client.evaluate(input.evaluation);
  if (evaluation.decision.outcome !== "ALLOW") return { evaluation };
  return { evaluation, result: await input.execute() };
}

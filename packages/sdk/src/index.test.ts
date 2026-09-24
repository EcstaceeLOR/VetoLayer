import { describe, expect, it, vi } from "vitest";
import { createVetoLayerClient, guardedToolCall } from "./index";

const baseResponse = {
  requestId: "req-1",
  trace: [],
  persistence: "memory" as const,
  providerTrace: undefined,
  receipt: {
    schemaVersion: "1.0.0" as const,
    receiptId: "receipt-1",
    decisionId: "decision-1",
    action: { requestId: "action-1", type: "support", tool: "billing", operation: "issue-refund", targetType: "account" },
    actor: { id: "support-agent", kind: "agent" as const },
    outcome: "ALLOW" as const,
    decisionSummary: "Allowed.",
    policiesEvaluated: [],
    deterministicFindings: [],
    contextualFindings: [],
    evidenceUsed: [],
    missingEvidence: [],
    contradictoryEvidence: [],
    exceptionPath: [],
    requirementsToChangeOutcome: [],
    timestamps: { requestedAt: "2026-09-24T14:00:00.000Z", decidedAt: "2026-09-24T14:00:00.000Z", receiptCreatedAt: "2026-09-24T14:00:00.000Z" },
    trace: [],
    versions: { receiptSchema: "1.0.0" as const, orchestrator: "1.0.0" as const },
    integrity: { algorithm: "SHA-256" as const, hash: "a".repeat(64) },
  },
  decision: {
    id: "decision-1",
    actionRequestId: "action-1",
    outcome: "ALLOW" as const,
    deterministicFindings: [], contextualFindings: [], missingEvidence: [], contradictoryEvidence: [], appliedPolicyIds: [],
    summary: "Allowed.", decidedAt: "2026-09-24T14:00:00.000Z",
  },
};

const evaluation = {
  action: {
    id: "action-1",
    actor: { id: "support-agent", kind: "agent" as const },
    action: { type: "support", tool: "billing", operation: "issue-refund", arguments: { amount: 20 } },
    target: { type: "account", id: "acct-1" },
    context: {},
    requestedAt: "2026-09-24T14:00:00.000Z",
  },
  policies: [],
};

describe("VetoLayer SDK", () => {
  it("sends workspace and auth headers through the tiny client", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer secret");
      expect(headers.get("X-VetoLayer-Workspace")).toBe("acme");
      return new Response(JSON.stringify(baseResponse), { status: 200 });
    });
    const client = createVetoLayerClient({ baseUrl: "https://veto.example/", apiKey: "secret", workspaceId: "acme", fetch: fetchMock as typeof fetch });
    const result = await client.evaluate(evaluation);
    expect(result.decision.outcome).toBe("ALLOW");
  });

  it("does not execute a tool unless VetoLayer returns ALLOW", async () => {
    const execute = vi.fn(async () => "executed");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ...baseResponse,
      decision: { ...baseResponse.decision, outcome: "REVIEW" },
      receipt: { ...baseResponse.receipt, outcome: "REVIEW" },
    }), { status: 200 }));
    const client = createVetoLayerClient({ baseUrl: "https://veto.example", fetch: fetchMock as typeof fetch });
    const result = await guardedToolCall({ client, evaluation, execute });
    expect(result.evaluation.decision.outcome).toBe("REVIEW");
    expect(execute).not.toHaveBeenCalled();
  });
});

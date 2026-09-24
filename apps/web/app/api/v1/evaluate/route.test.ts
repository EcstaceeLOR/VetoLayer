import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const refundRequest = {
  action: {
    id: "support_refund_42",
    actor: { id: "support-agent", kind: "agent", name: "Support Agent" },
    action: {
      type: "customer-support",
      tool: "billing-service",
      operation: "issue-refund",
      arguments: { accountId: "acct-42", amount: 750, currency: "USD" },
    },
    target: { type: "customer-account", id: "acct-42", environment: "production" },
    context: { source: "support-agent", environment: "production" },
    requestedAt: "2026-09-24T15:00:00.000Z",
  },
  policies: [
    {
      id: "large-refund-review",
      name: "Large refunds require review",
      description: "Refunds at or above 500 require human review before execution.",
      mode: "deterministic",
      severity: "high",
      priority: 1,
      enabled: true,
      requiredEvidence: [],
      exceptions: [],
      scope: { actionTypes: ["customer-support"], tools: ["billing-service"], environments: ["production"] },
      rule: {
        effect: "review",
        match: "all",
        conditions: [{ field: "facts.refundAmount", operator: "greater_than_or_equal", value: 500 }],
      },
    },
  ],
  facts: { refundAmount: 750 },
  environment: { region: "us-east", customerTier: "business" },
};

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/v1/evaluate", () => {
  it("validates and evaluates a non-GitHub customer-support action through the production pipeline", async () => {
    const response = await POST(
      new Request("http://localhost/api/v1/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refundRequest),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision.outcome).toBe("REVIEW");
    expect(body.receipt.action.tool).toBe("billing-service");
    expect(body.receipt.action.operation).toBe("issue-refund");
    expect(body.receipt.policiesEvaluated[0].id).toBe("large-refund-review");
    expect(body.receipt.integrity.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns a stable error code for malformed Action Requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/v1/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...refundRequest, action: { id: "bad" } }),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_ACTION");
  });

  it("disables the production API when no bearer key is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VETOLAYER_API_KEY", "");

    const response = await POST(
      new Request("https://vetolayer.example/api/v1/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refundRequest),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("API_AUTH_NOT_CONFIGURED");
  });
});

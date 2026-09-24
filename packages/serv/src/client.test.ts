import { describe, expect, it, vi } from "vitest";
import type { ContextualPolicy } from "@vetolayer/core";
import { exampleActionRequests, exampleEvidence } from "@vetolayer/core";
import { evaluateWithServ } from "./client";
import type { ServReasoningInput } from "./types";

const contextualPolicy = {
  id: "policy_auth_restricted_window",
  name: "Restricted-window auth deployment",
  description:
    "Authentication changes normally require review during restricted deployment windows unless a critical-remediation exception is satisfied.",
  severity: "critical",
  priority: 10,
  enabled: true,
  mode: "contextual",
  requiredEvidence: [],
  exceptions: [
    {
      id: "critical-remediation",
      description: "Allow emergency remediation when the security exception is fully evidenced.",
      criteria: [
        "The change fixes a critical active security issue",
        "Required security validation has passed",
      ],
      requiredEvidence: ["ci-status"],
    },
  ],
  scope: {
    actionTypes: ["deployment"],
    environments: ["production"],
  },
  instruction:
    "Judge whether the restricted-window deployment should proceed under the documented critical-remediation exception.",
  decisionCriteria: [
    "Only use supplied evidence",
    "If the exception is not fully supported, require review",
  ],
} satisfies ContextualPolicy;

const input: ServReasoningInput = {
  action: exampleActionRequests.deployment,
  contextualPolicies: [contextualPolicy],
  deterministicFindings: [],
  evidence: [exampleEvidence.ciPassed],
  environment: {
    restrictedWindow: true,
    incidentSeverity: "critical",
  },
};

function validDecision(overrides: Record<string, unknown> = {}) {
  return {
    recommendedOutcome: "ALLOW",
    policyFindings: [
      {
        policyId: contextualPolicy.id,
        status: "pass",
        summary: "The critical-remediation exception is supported by the supplied context and evidence.",
        evidenceIds: [exampleEvidence.ciPassed.id],
      },
    ],
    evidenceUsed: [exampleEvidence.ciPassed.id],
    missingEvidence: [],
    contradictoryEvidence: [],
    exceptionAnalysis: [
      {
        policyId: contextualPolicy.id,
        exceptionId: "critical-remediation",
        applies: true,
        satisfiedCriteria: [
          "The change fixes a critical active security issue",
          "Required security validation has passed",
        ],
        unsatisfiedCriteria: [],
        summary: "The supplied evidence supports the emergency-remediation exception.",
      },
    ],
    rationale: "The exception is supported by the supplied evidence.",
    confidence: 0.92,
    ...overrides,
  };
}

describe("evaluateWithServ", () => {
  it("calls the OpenAI-compatible SERV endpoint and returns validated reasoning", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://serv.example/v1/chat/completions");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");

      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("serv-test-model");
      expect(body.messages).toHaveLength(2);
      expect(body.messages[1].content).toContain(contextualPolicy.id);

      return new Response(
        JSON.stringify({
          id: "req-body-1",
          choices: [{ message: { content: JSON.stringify(validDecision()) } }],
          usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
        }),
        {
          status: 200,
          headers: { "x-request-id": "serv-request-123" },
        },
      );
    });

    const result = await evaluateWithServ(
      input,
      {
        apiKey: "test-key",
        model: "serv-test-model",
        baseUrl: "https://serv.example/v1/",
      },
      fetchMock as typeof fetch,
    );

    expect(result.error).toBeUndefined();
    expect(result.decision.recommendedOutcome).toBe("ALLOW");
    expect(result.trace.providerStatus).toBe("ok");
    expect(result.trace.requestId).toBe("serv-request-123");
    expect(result.trace.usage?.totalTokens).toBe(200);
  });

  it("accepts fenced JSON while still validating its schema", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `\`\`\`json\n${JSON.stringify(validDecision())}\n\`\`\``,
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await evaluateWithServ(
      input,
      { apiKey: "test-key", model: "serv-test-model" },
      fetchMock as typeof fetch,
    );

    expect(result.trace.providerStatus).toBe("ok");
    expect(result.decision.recommendedOutcome).toBe("ALLOW");
  });

  it("falls back to REVIEW when SERV returns malformed reasoning", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "not-json" } }] }),
        { status: 200 },
      ),
    );

    const result = await evaluateWithServ(
      input,
      { apiKey: "test-key", model: "serv-test-model" },
      fetchMock as typeof fetch,
    );

    expect(result.decision.recommendedOutcome).toBe("REVIEW");
    expect(result.trace.providerStatus).toBe("fallback");
    expect(result.error?.code).toBe("MALFORMED_RESPONSE");
  });

  it("falls back to REVIEW on provider HTTP failures", async () => {
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 503 }));

    const result = await evaluateWithServ(
      input,
      { apiKey: "test-key", model: "serv-test-model" },
      fetchMock as typeof fetch,
    );

    expect(result.decision.recommendedOutcome).toBe("REVIEW");
    expect(result.error?.code).toBe("HTTP_ERROR");
  });

  it("rejects reasoning that cites evidence VetoLayer never supplied", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(
                  validDecision({ evidenceUsed: ["invented-evidence"] }),
                ),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await evaluateWithServ(
      input,
      { apiKey: "test-key", model: "serv-test-model" },
      fetchMock as typeof fetch,
    );

    expect(result.decision.recommendedOutcome).toBe("REVIEW");
    expect(result.error?.code).toBe("INVALID_REASONING");
  });

  it("does not call the provider when credentials are incomplete", async () => {
    const fetchMock = vi.fn();

    const result = await evaluateWithServ(
      input,
      { apiKey: "", model: "serv-test-model" },
      fetchMock as typeof fetch,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.decision.recommendedOutcome).toBe("REVIEW");
    expect(result.error?.code).toBe("CONFIGURATION_ERROR");
  });
});

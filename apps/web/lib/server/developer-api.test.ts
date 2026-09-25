import { describe, expect, it } from "vitest";
import { parseDeveloperEvaluationPayload } from "./developer-api";

const action = {
  id: "action_managed_policy",
  actor: { id: "agent", kind: "agent" as const },
  action: { type: "deployment", tool: "github", operation: "deploy-production", arguments: {} },
  target: { type: "service", id: "api", environment: "production" },
  context: { source: "test", environment: "production" },
  requestedAt: "2026-09-25T10:00:00.000Z",
};

describe("parseDeveloperEvaluationPayload", () => {
  it("allows policy definitions to be omitted when Policy Studio manages the project scope", () => {
    const result = parseDeveloperEvaluationPayload({ action, evidence: [], facts: { riskScore: 80 } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.policies).toEqual([]);
  });

  it("still validates request policy fallbacks when they are supplied", () => {
    const result = parseDeveloperEvaluationPayload({ action, policies: [{ id: "bad" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.error.code).toBe("INVALID_POLICY");
  });

  it("rejects a non-array policies field instead of silently ignoring it", () => {
    const result = parseDeveloperEvaluationPayload({ action, policies: { id: "not-an-array" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.error.code).toBe("INVALID_POLICY");
  });
});

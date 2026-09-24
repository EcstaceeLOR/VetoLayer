import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as evaluate } from "./evaluate/route";
import { POST as review } from "./review/route";
import { DELETE as reset } from "./reset/route";

function servFetch() {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    const prompt = String(request.messages?.[1]?.content ?? "");
    const approved = prompt.includes("security-lead");
    const outcome = approved ? "ALLOW" : "REVIEW";

    const decision = {
      recommendedOutcome: outcome,
      policyFindings: [
        {
          policyId: "github-sensitive-change-context",
          status: approved ? "pass" : "uncertain",
          summary: approved
            ? "Critical-remediation exception is supported by the supplied evidence."
            : "Human security approval is still missing.",
          evidenceIds: [
            "github-files-312",
            "github-checks-secfix-312-a91f",
            "github-reviews-312",
            "incident-INC-2041",
          ],
        },
      ],
      evidenceUsed: [
        "github-files-312",
        "github-checks-secfix-312-a91f",
        "github-reviews-312",
        "incident-INC-2041",
      ],
      missingEvidence: approved
        ? []
        : [
            {
              policyId: "github-sensitive-change-context",
              key: "security-lead-approval",
              description: "authorized security-lead approval",
            },
          ],
      contradictoryEvidence: [],
      exceptionAnalysis: [
        {
          policyId: "github-sensitive-change-context",
          exceptionId: "critical-security-remediation",
          applies: approved,
          satisfiedCriteria: approved
            ? [
                "The supplied context shows an urgent or critical security reason",
                "CI/check evidence is successful",
                "A human reviewer has approved the change",
              ]
            : [
                "The supplied context shows an urgent or critical security reason",
                "CI/check evidence is successful",
              ],
          unsatisfiedCriteria: approved ? [] : ["A human reviewer has approved the change"],
          summary: approved ? "Exception supported." : "Approval condition remains unresolved.",
        },
      ],
      rationale: approved
        ? "The critical security remediation exception is now fully supported."
        : "Human review is required until the security approval arrives.",
      confidence: 0.96,
    };

    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }),
      { status: 200, headers: { "x-request-id": `demo-${outcome.toLowerCase()}` } },
    );
  });
}

function configureServ() {
  vi.stubEnv("SERV_API_KEY", "test-serv-key");
  vi.stubEnv("SERV_MODEL", "serv-test-model");
  vi.stubEnv("SERV_BASE_URL", "https://serv.example/v1");
  vi.stubGlobal("fetch", servFetch());
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("public flagship demo HTTP flow", () => {
  it("moves the same action from REVIEW to ALLOW through review evidence", async () => {
    configureServ();

    const first = await evaluate(
      new Request("https://vetolayer.example/api/demo/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "needs-approval" }),
      }),
    );
    const firstBody = await first.json();

    expect(first.status).toBe(200);
    expect(firstBody.outcome).toBe("REVIEW");
    expect(firstBody.reviewCaseId).toBeTruthy();

    const second = await review(
      new Request("https://vetolayer.example/api/demo/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewCaseId: firstBody.reviewCaseId }),
      }),
    );
    const secondBody = await second.json();

    expect(second.status).toBe(200);
    expect(secondBody.stage).toBe("resolved");
    expect(secondBody.outcome).toBe("ALLOW");
    expect(secondBody.receipt.action.requestId).toBe(firstBody.receipt.action.requestId);
    expect(secondBody.receipt.integrity.hash).not.toBe(firstBody.receipt.integrity.hash);
  });

  it("rejects attempts to request the resolved state directly", async () => {
    configureServ();

    const response = await evaluate(
      new Request("https://vetolayer.example/api/demo/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "resolved" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("resets demo state through the server endpoint", async () => {
    const response = await reset();
    expect(response.status).toBe(204);
  });
});

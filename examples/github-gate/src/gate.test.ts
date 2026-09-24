import { describe, expect, it, vi } from "vitest";
import { verifyDecisionReceipt } from "@vetolayer/core";
import { evaluateGitHubSnapshot } from "./gate";
import type { GitHubPullRequestSnapshot } from "./github-client";

const now = new Date("2026-09-24T14:30:00.000Z");

function snapshot(overrides: Partial<GitHubPullRequestSnapshot> = {}): GitHubPullRequestSnapshot {
  return {
    owner: "acme",
    repo: "api",
    number: 42,
    title: "Harden session authentication",
    url: "https://github.com/acme/api/pull/42",
    headSha: "abc123",
    baseBranch: "main",
    draft: false,
    merged: false,
    changedFiles: [
      { filename: "src/auth/session.ts", status: "modified", additions: 20, deletions: 4 },
    ],
    reviews: [{ user: "security-reviewer", state: "APPROVED" }],
    checks: [{ name: "CI / verify", status: "completed", conclusion: "success" }],
    ...overrides,
  };
}

function servFetch(outcome: "ALLOW" | "REVIEW" | "BLOCK" = "ALLOW") {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const userPrompt = body.messages[1].content as string;
    expect(userPrompt).toContain("github-sensitive-change-context");

    const status = outcome === "ALLOW" ? "pass" : outcome === "BLOCK" ? "fail" : "uncertain";
    const decision = {
      recommendedOutcome: outcome,
      policyFindings: [
        {
          policyId: "github-sensitive-change-context",
          status,
          summary: `Sensitive change contextual judgment is ${outcome}.`,
          evidenceIds: ["github-files-42", "github-checks-abc123", "github-reviews-42"],
        },
      ],
      evidenceUsed: ["github-files-42", "github-checks-abc123", "github-reviews-42"],
      missingEvidence: [],
      contradictoryEvidence: [],
      exceptionAnalysis: [
        {
          policyId: "github-sensitive-change-context",
          exceptionId: "critical-security-remediation",
          applies: false,
          satisfiedCriteria: [],
          unsatisfiedCriteria: [],
          summary: "No exception is required for this normal-window evaluation.",
        },
      ],
      rationale: `SERV recommends ${outcome} based on the supplied GitHub evidence.`,
      confidence: 0.94,
    };

    return new Response(
      JSON.stringify({
        id: "serv-github-gate-test",
        choices: [{ message: { content: JSON.stringify(decision) } }],
      }),
      { status: 200, headers: { "x-request-id": "serv-gate-1" } },
    );
  });
}

const servConfig = {
  apiKey: "test-key",
  model: "serv-test-model",
  baseUrl: "https://serv.example/v1",
};

describe("GitHub coding-agent gate", () => {
  it("returns ALLOW with a verifiable receipt when CI and human approval are present", async () => {
    const result = await evaluateGitHubSnapshot({
      snapshot: snapshot(),
      servConfig,
      servFetch: servFetch("ALLOW") as typeof fetch,
      now,
    });

    expect(result.orchestration.decision.outcome).toBe("ALLOW");
    expect(result.receipt.outcome).toBe("ALLOW");
    expect(result.receipt.providerTrace?.providerStatus).toBe("ok");
    expect(await verifyDecisionReceipt(result.receipt)).toBe(true);
  });

  it("moves the same proposed action from REVIEW to ALLOW after missing approval is supplied", async () => {
    const withoutApproval = snapshot({ reviews: [] });
    const withApproval = snapshot({ reviews: [{ user: "security-reviewer", state: "APPROVED" }] });

    const first = await evaluateGitHubSnapshot({
      snapshot: withoutApproval,
      servConfig,
      servFetch: servFetch("ALLOW") as typeof fetch,
      now,
    });
    const second = await evaluateGitHubSnapshot({
      snapshot: withApproval,
      servConfig,
      servFetch: servFetch("ALLOW") as typeof fetch,
      now,
    });

    expect(first.orchestration.decision.outcome).toBe("REVIEW");
    expect(second.orchestration.decision.outcome).toBe("ALLOW");
    expect(first.receipt.missingEvidence).toHaveLength(0);
    expect(first.receipt.requirementsToChangeOutcome.some((item) => item.includes("github-review-required"))).toBe(true);
  });

  it("hard BLOCKs a draft PR before SERV is called", async () => {
    const mockServ = servFetch("ALLOW");
    const result = await evaluateGitHubSnapshot({
      snapshot: snapshot({ draft: true }),
      servConfig,
      servFetch: mockServ as typeof fetch,
      now,
    });

    expect(result.orchestration.decision.outcome).toBe("BLOCK");
    expect(mockServ).not.toHaveBeenCalled();
  });

  it("routes failed CI to REVIEW rather than allowing execution", async () => {
    const result = await evaluateGitHubSnapshot({
      snapshot: snapshot({
        checks: [{ name: "CI / verify", status: "completed", conclusion: "failure" }],
      }),
      servConfig,
      servFetch: servFetch("ALLOW") as typeof fetch,
      now,
    });

    expect(result.orchestration.decision.outcome).toBe("REVIEW");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardDecisions } from "../dashboard-data";
import { createSupabaseDecisionStore } from "./decision-store";
import { readServerEnvironment } from "./env";
import { consumeRateLimit, resetRateLimitsForTests } from "./rate-limit";

describe("public MVP hardening", () => {
  beforeEach(() => resetRateLimitsForTests());

  it("rejects partial persistence configuration", () => {
    expect(() =>
      readServerEnvironment({ SUPABASE_URL: "https://example.supabase.co" } as NodeJS.ProcessEnv),
    ).toThrow("must be configured together");
  });

  it("never requires SERV credentials merely to boot the web app", () => {
    const environment = readServerEnvironment({} as NodeJS.ProcessEnv);
    expect(environment.servConfigured).toBe(false);
    expect(environment.persistenceConfigured).toBe(false);
  });

  it("enforces the configured request limit", () => {
    expect(consumeRateLimit({ key: "demo:test", limit: 2, now: 1 }).allowed).toBe(true);
    expect(consumeRateLimit({ key: "demo:test", limit: 2, now: 2 }).allowed).toBe(true);
    expect(consumeRateLimit({ key: "demo:test", limit: 2, now: 3 }).allowed).toBe(false);
  });

  it("persists and reads Decision Receipts through the Supabase REST boundary", async () => {
    const receipt = dashboardDecisions[0]!;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: receipt.receiptId,
              workspace_id: "demo",
              source: "demo",
              receipt,
              created_at: receipt.timestamps.receiptCreatedAt,
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const store = createSupabaseDecisionStore(
      { url: "https://example.supabase.co", serviceRoleKey: "server-secret" },
      fetchMock as typeof fetch,
    );

    await store.save({
      id: receipt.receiptId,
      workspaceId: "demo",
      source: "demo",
      receipt,
      createdAt: receipt.timestamps.receiptCreatedAt,
    });
    const history = await store.list("demo", 10);
    await store.clearDemo("demo");

    expect(history).toHaveLength(1);
    expect(history[0]?.receipt.decisionId).toBe(receipt.decisionId);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/rest/v1/vetolayer_decisions");
  });
});

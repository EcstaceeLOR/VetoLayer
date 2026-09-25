import { beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardDecisions } from "../dashboard-data";
import { createSupabaseDecisionStore } from "./decision-store";
import { readServerEnvironment } from "./env";
import { consumeRateLimit, resetRateLimitsForTests } from "./rate-limit";

function env(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

describe("public product hardening", () => {
  beforeEach(() => resetRateLimitsForTests());

  it("rejects partial persistence configuration", () => {
    expect(() =>
      readServerEnvironment(env({ SUPABASE_URL: "https://example.supabase.co" })),
    ).toThrow("must be configured together");
  });

  it("never requires SERV credentials merely to boot the web app", () => {
    const environment = readServerEnvironment(env());
    expect(environment.servConfigured).toBe(false);
    expect(environment.persistenceConfigured).toBe(false);
  });

  it("enforces the configured request limit", () => {
    expect(consumeRateLimit({ key: "api:test", limit: 2, now: 1 }).allowed).toBe(true);
    expect(consumeRateLimit({ key: "api:test", limit: 2, now: 2 }).allowed).toBe(true);
    expect(consumeRateLimit({ key: "api:test", limit: 2, now: 3 }).allowed).toBe(false);
  });

  it("persists workspace-namespaced Decision Receipts through the Supabase REST boundary", async () => {
    const receipt = dashboardDecisions[0]!;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: `ws_prod:${receipt.receiptId}`,
              workspace_id: "ws_prod",
              source: "api",
              receipt,
              created_at: receipt.timestamps.receiptCreatedAt,
            },
          ]),
          { status: 200 },
        ),
      );

    const store = createSupabaseDecisionStore(
      { url: "https://example.supabase.co", serviceRoleKey: "server-secret" },
      fetchMock as typeof fetch,
    );

    await store.save({
      id: receipt.receiptId,
      workspaceId: "ws_prod",
      source: "api",
      receipt,
      createdAt: receipt.timestamps.receiptCreatedAt,
    });
    const history = await store.list("ws_prod", 10);

    expect(history).toHaveLength(1);
    expect(history[0]?.id).toBe(receipt.receiptId);
    expect(history[0]?.receipt.decisionId).toBe(receipt.decisionId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/rest/v1/vetolayer_decisions");
    const saveInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(saveInit.body)).id).toBe(`ws_prod:${receipt.receiptId}`);
  });
});

import type { DecisionReceipt } from "@vetolayer/core";
import { readServerEnvironment } from "./env";

export type StoredDecision = {
  id: string;
  workspaceId: string;
  source: "demo" | "api" | "integration";
  receipt: DecisionReceipt;
  createdAt: string;
};

export type DecisionStore = {
  save(record: StoredDecision): Promise<void>;
  list(workspaceId: string, limit?: number): Promise<StoredDecision[]>;
  clearDemo(workspaceId: string): Promise<void>;
};

export function createSupabaseDecisionStore(
  config: {
    url: string;
    serviceRoleKey: string;
  },
  fetchImpl: typeof fetch = fetch,
): DecisionStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  async function requireSuccess(response: Response, operation: string) {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    throw new Error(`Decision persistence ${operation} failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  return {
    async save(record) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_decisions`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: record.id,
          workspace_id: record.workspaceId,
          source: record.source,
          receipt: record.receipt,
          created_at: record.createdAt,
        }),
      });
      await requireSuccess(response, "save");
    },

    async list(workspaceId, limit = 50) {
      const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
      const query = new URLSearchParams({
        select: "id,workspace_id,source,receipt,created_at",
        workspace_id: `eq.${workspaceId}`,
        order: "created_at.desc",
        limit: String(safeLimit),
      });
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/vetolayer_decisions?${query.toString()}`,
        { headers },
      );
      await requireSuccess(response, "list");
      const rows = (await response.json()) as Array<{
        id: string;
        workspace_id: string;
        source: StoredDecision["source"];
        receipt: DecisionReceipt;
        created_at: string;
      }>;
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        source: row.source,
        receipt: row.receipt,
        createdAt: row.created_at,
      }));
    },

    async clearDemo(workspaceId) {
      const query = new URLSearchParams({
        workspace_id: `eq.${workspaceId}`,
        source: "eq.demo",
      });
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/vetolayer_decisions?${query.toString()}`,
        { method: "DELETE", headers },
      );
      await requireSuccess(response, "clear-demo");
    },
  };
}

export function getOptionalDecisionStore(): DecisionStore | null {
  const environment = readServerEnvironment();
  if (
    !environment.persistenceConfigured ||
    !environment.supabaseUrl ||
    !environment.supabaseServiceRoleKey
  ) {
    return null;
  }

  return createSupabaseDecisionStore({
    url: environment.supabaseUrl,
    serviceRoleKey: environment.supabaseServiceRoleKey,
  });
}

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
  get(workspaceId: string, id: string): Promise<StoredDecision | null>;
  list(workspaceId: string, limit?: number): Promise<StoredDecision[]>;
  clearDemo(workspaceId: string): Promise<void>;
};

const memoryDecisions = new Map<string, StoredDecision>();

function storageId(workspaceId: string, id: string) {
  return `${workspaceId}:${id}`;
}

export function createMemoryDecisionStore(): DecisionStore {
  return {
    async save(record) {
      memoryDecisions.set(storageId(record.workspaceId, record.id), record);
    },
    async get(workspaceId, id) {
      return memoryDecisions.get(storageId(workspaceId, id)) ?? null;
    },
    async list(workspaceId, limit = 50) {
      return [...memoryDecisions.values()]
        .filter((item) => item.workspaceId === workspaceId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, Math.max(1, Math.min(200, Math.trunc(limit))));
    },
    async clearDemo(workspaceId) {
      for (const [key, record] of memoryDecisions.entries()) {
        if (record.workspaceId === workspaceId && record.source === "demo") memoryDecisions.delete(key);
      }
    },
  };
}

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

  function mapRow(row: {
    id: string;
    workspace_id: string;
    source: StoredDecision["source"];
    receipt: DecisionReceipt;
    created_at: string;
  }): StoredDecision {
    return {
      id: row.receipt.receiptId,
      workspaceId: row.workspace_id,
      source: row.source,
      receipt: row.receipt,
      createdAt: row.created_at,
    };
  }

  return {
    async save(record) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_decisions`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: storageId(record.workspaceId, record.id),
          workspace_id: record.workspaceId,
          source: record.source,
          receipt: record.receipt,
          created_at: record.createdAt,
        }),
      });
      await requireSuccess(response, "save");
    },

    async get(workspaceId, id) {
      const query = new URLSearchParams({
        select: "id,workspace_id,source,receipt,created_at",
        workspace_id: `eq.${workspaceId}`,
        id: `eq.${storageId(workspaceId, id)}`,
        limit: "1",
      });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_decisions?${query.toString()}`, { headers });
      await requireSuccess(response, "get");
      const rows = (await response.json()) as Array<Parameters<typeof mapRow>[0]>;
      return rows[0] ? mapRow(rows[0]) : null;
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
      const rows = (await response.json()) as Array<Parameters<typeof mapRow>[0]>;
      return rows.map(mapRow);
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

const memoryStore = createMemoryDecisionStore();

export function getDecisionStore(): { store: DecisionStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (
    environment.persistenceConfigured &&
    environment.supabaseUrl &&
    environment.supabaseServiceRoleKey
  ) {
    return {
      store: createSupabaseDecisionStore({
        url: environment.supabaseUrl,
        serviceRoleKey: environment.supabaseServiceRoleKey,
      }),
      persistence: "supabase",
    };
  }
  return { store: memoryStore, persistence: "memory" };
}

export function getOptionalDecisionStore(): DecisionStore | null {
  const result = getDecisionStore();
  return result.persistence === "supabase" ? result.store : null;
}

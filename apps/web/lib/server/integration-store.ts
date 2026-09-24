import type { IntegrationKey } from "../integration-contracts";
import { readServerEnvironment } from "./env";

export type StoredIntegrationConfig = {
  workspaceId: string;
  integration: IntegrationKey;
  state: "ready" | "warning" | "needs-config";
  account?: string;
  lastCode?: string;
  updatedAt: string;
};

export type IntegrationStore = {
  list(workspaceId: string): Promise<StoredIntegrationConfig[]>;
  save(record: StoredIntegrationConfig): Promise<void>;
};

const memory = new Map<string, StoredIntegrationConfig>();

export function createMemoryIntegrationStore(): IntegrationStore {
  return {
    async list(workspaceId) {
      return [...memory.values()]
        .filter((record) => record.workspaceId === workspaceId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async save(record) {
      memory.set(`${record.workspaceId}:${record.integration}`, record);
    },
  };
}

export function createSupabaseIntegrationStore(
  config: { url: string; serviceRoleKey: string },
  fetchImpl: typeof fetch = fetch,
): IntegrationStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  async function requireSuccess(response: Response, operation: string) {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    throw new Error(`Integration persistence ${operation} failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  return {
    async list(workspaceId) {
      const query = new URLSearchParams({
        select: "workspace_id,integration,state,account,last_code,updated_at",
        workspace_id: `eq.${workspaceId}`,
        order: "updated_at.desc",
      });
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/vetolayer_integration_configs?${query.toString()}`,
        { headers },
      );
      await requireSuccess(response, "list");
      const rows = (await response.json()) as Array<{
        workspace_id: string;
        integration: IntegrationKey;
        state: StoredIntegrationConfig["state"];
        account?: string | null;
        last_code?: string | null;
        updated_at: string;
      }>;
      return rows.map((row) => ({
        workspaceId: row.workspace_id,
        integration: row.integration,
        state: row.state,
        ...(row.account ? { account: row.account } : {}),
        ...(row.last_code ? { lastCode: row.last_code } : {}),
        updatedAt: row.updated_at,
      }));
    },

    async save(record) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_integration_configs`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: `${record.workspaceId}:${record.integration}`,
          workspace_id: record.workspaceId,
          integration: record.integration,
          state: record.state,
          account: record.account ?? null,
          last_code: record.lastCode ?? null,
          updated_at: record.updatedAt,
        }),
      });
      await requireSuccess(response, "save");
    },
  };
}

const memoryStore = createMemoryIntegrationStore();

export function getIntegrationStore(): { store: IntegrationStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return {
      store: createSupabaseIntegrationStore({
        url: environment.supabaseUrl,
        serviceRoleKey: environment.supabaseServiceRoleKey,
      }),
      persistence: "supabase",
    };
  }
  return { store: memoryStore, persistence: "memory" };
}

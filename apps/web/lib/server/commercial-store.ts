import type { CommercialPlanId } from "../commercial-plans";
import { COMMERCIAL_PLANS } from "../commercial-plans";
import { readServerEnvironment } from "./env";

export type WorkspacePlanRecord = {
  workspaceId: string;
  planId: CommercialPlanId;
  source: "system" | "manual" | "billing";
  assignedAt: string;
  updatedAt: string;
};

export type WorkspacePlanStore = {
  get(workspaceId: string): Promise<WorkspacePlanRecord>;
  save(record: WorkspacePlanRecord): Promise<void>;
};

const memoryPlans = new Map<string, WorkspacePlanRecord>();

export function defaultWorkspacePlan(workspaceId: string, now = new Date().toISOString()): WorkspacePlanRecord {
  return { workspaceId, planId: "developer", source: "system", assignedAt: now, updatedAt: now };
}

function assertPlanId(value: string): asserts value is CommercialPlanId {
  if (!(value in COMMERCIAL_PLANS)) throw new Error("Unsupported commercial plan.");
}

export function createMemoryWorkspacePlanStore(): WorkspacePlanStore {
  return {
    async get(workspaceId) { return memoryPlans.get(workspaceId) ?? defaultWorkspacePlan(workspaceId); },
    async save(record) {
      assertPlanId(record.planId);
      memoryPlans.set(record.workspaceId, record);
    },
  };
}

type Row = { workspace_id: string; plan_id: string; source: WorkspacePlanRecord["source"]; assigned_at: string; updated_at: string };

export function createSupabaseWorkspacePlanStore(config: { url: string; serviceRoleKey: string }, fetchImpl: typeof fetch = fetch): WorkspacePlanStore {
  const base = config.url.replace(/\/+$/, "");
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" };
  function fromRow(row: Row): WorkspacePlanRecord {
    assertPlanId(row.plan_id);
    return { workspaceId: row.workspace_id, planId: row.plan_id, source: row.source, assignedAt: row.assigned_at, updatedAt: row.updated_at };
  }
  async function requireSuccess(response: Response, operation: string) {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    throw new Error(`Commercial plan persistence ${operation} failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return {
    async get(workspaceId) {
      const query = new URLSearchParams({ workspace_id: `eq.${workspaceId}`, select: "workspace_id,plan_id,source,assigned_at,updated_at", limit: "1" });
      const response = await fetchImpl(`${base}/rest/v1/vetolayer_workspace_plans?${query}`, { headers, cache: "no-store" });
      await requireSuccess(response, "get");
      const rows = await response.json() as Row[];
      return rows[0] ? fromRow(rows[0]) : defaultWorkspacePlan(workspaceId);
    },
    async save(record) {
      assertPlanId(record.planId);
      const response = await fetchImpl(`${base}/rest/v1/vetolayer_workspace_plans`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ workspace_id: record.workspaceId, plan_id: record.planId, source: record.source, assigned_at: record.assignedAt, updated_at: record.updatedAt }),
      });
      await requireSuccess(response, "save");
    },
  };
}

const memoryStore = createMemoryWorkspacePlanStore();
export function getWorkspacePlanStore(): { store: WorkspacePlanStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return { store: createSupabaseWorkspacePlanStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey }), persistence: "supabase" };
  }
  return { store: memoryStore, persistence: "memory" };
}

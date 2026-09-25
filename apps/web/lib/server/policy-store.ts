import type { Policy } from "@vetolayer/core";
import { PolicySchema } from "@vetolayer/core";
import { readServerEnvironment } from "./env";

export type PolicyScope = { projectId?: string; environmentId?: string };

export type StoredPolicy = {
  workspaceId: string;
  projectId?: string;
  environmentId?: string;
  policy: Policy;
  updatedAt: string;
};

export type PolicyStore = {
  list(workspaceId: string, scope?: PolicyScope): Promise<StoredPolicy[]>;
  save(record: StoredPolicy): Promise<void>;
};

export function createSupabasePolicyStore(config: { url: string; serviceRoleKey: string }, fetchImpl: typeof fetch = fetch): PolicyStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" };

  async function requireSuccess(response: Response, operation: string) {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    throw new Error(`Policy persistence ${operation} failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  return {
    async list(workspaceId, scope) {
      const query = new URLSearchParams({ select: "workspace_id,project_id,environment_id,policy,updated_at", workspace_id: `eq.${workspaceId}`, order: "updated_at.desc" });
      if (scope?.projectId) query.set("project_id", `eq.${scope.projectId}`);
      if (scope?.environmentId) query.set("environment_id", `eq.${scope.environmentId}`);
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_policies?${query}`, { headers });
      await requireSuccess(response, "list");
      const rows = await response.json() as Array<{ workspace_id: string; project_id?: string | null; environment_id?: string | null; policy: unknown; updated_at: string }>;
      return rows.map((row) => ({
        workspaceId: row.workspace_id,
        ...(row.project_id ? { projectId: row.project_id } : {}),
        ...(row.environment_id ? { environmentId: row.environment_id } : {}),
        policy: PolicySchema.parse(row.policy),
        updatedAt: row.updated_at,
      }));
    },

    async save(record) {
      const validated = PolicySchema.parse(record.policy);
      const identity = [record.workspaceId, record.projectId ?? "workspace", record.environmentId ?? "all", validated.id].join(":");
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_policies`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: identity, workspace_id: record.workspaceId, project_id: record.projectId ?? null, environment_id: record.environmentId ?? null, policy: validated, updated_at: record.updatedAt }),
      });
      await requireSuccess(response, "save");
    },
  };
}

export function getOptionalPolicyStore(): PolicyStore | null {
  const environment = readServerEnvironment();
  if (!environment.persistenceConfigured || !environment.supabaseUrl || !environment.supabaseServiceRoleKey) return null;
  return createSupabasePolicyStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey });
}

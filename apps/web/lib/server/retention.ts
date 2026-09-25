import { readServerEnvironment } from "./env";

export type RetentionApplyResult = {
  workspaceId: string;
  configured: boolean;
  decisionsDeleted: number;
  reviewsDeleted: number;
  notificationEventsDeleted: number;
};

async function callRetentionRpc(name: string, body: Record<string, unknown> = {}) {
  const environment = readServerEnvironment();
  if (!environment.persistenceConfigured || !environment.supabaseUrl || !environment.supabaseServiceRoleKey) {
    return { persistence: "memory" as const, result: null };
  }
  const response = await fetch(`${environment.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: environment.supabaseServiceRoleKey,
      Authorization: `Bearer ${environment.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Retention RPC ${name} failed (${response.status}).`);
  return { persistence: "supabase" as const, result: await response.json() as unknown };
}

export async function applyWorkspaceRetention(workspaceId: string) {
  const response = await callRetentionRpc("vetolayer_apply_workspace_retention", { p_workspace_id: workspaceId });
  return { persistence: response.persistence, result: response.result as RetentionApplyResult | null };
}

export async function applyAllWorkspaceRetention() {
  const response = await callRetentionRpc("vetolayer_apply_all_retention");
  return { persistence: response.persistence, results: Array.isArray(response.result) ? response.result as RetentionApplyResult[] : [] };
}

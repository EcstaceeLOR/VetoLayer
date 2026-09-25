import type { DecisionReceipt, HumanReviewRecord } from "@vetolayer/core";
import type { GitHubGateOperation, GitHubIncidentContext, GitHubPullRequestSnapshot } from "@vetolayer/github-gate";
import { readServerEnvironment } from "./env";

export type GitHubReviewContext = {
  kind: "github";
  snapshot: GitHubPullRequestSnapshot;
  operation: GitHubGateOperation;
  restrictedWindow: boolean;
  incident?: GitHubIncidentContext;
};

export type ReviewScope = { projectId?: string; environmentId?: string };

export type ReviewCase = {
  id: string;
  workspaceId: string;
  projectId?: string;
  environmentId?: string;
  status: "pending" | "resolved";
  title: string;
  source: "demo" | "api" | "integration";
  receipt: DecisionReceipt;
  context: GitHubReviewContext;
  createdAt: string;
  updatedAt: string;
  review?: HumanReviewRecord;
  resolutionReceipt?: DecisionReceipt;
};

export type ReviewStore = {
  list(workspaceId: string, scope?: ReviewScope): Promise<ReviewCase[]>;
  get(workspaceId: string, id: string): Promise<ReviewCase | null>;
  save(reviewCase: ReviewCase): Promise<void>;
  clearDemo(workspaceId: string): Promise<void>;
};

const memoryCases = new Map<string, ReviewCase>();
function storageId(workspaceId: string, id: string) { return `${workspaceId}:${id}`; }
function matchesScope(item: ReviewCase, scope?: ReviewScope) {
  if (!scope) return true;
  if (scope.projectId && item.projectId !== scope.projectId) return false;
  if (scope.environmentId && item.environmentId !== scope.environmentId) return false;
  return true;
}

export function createMemoryReviewStore(): ReviewStore {
  return {
    async list(workspaceId, scope) { return [...memoryCases.values()].filter((item) => item.workspaceId === workspaceId && matchesScope(item, scope)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
    async get(workspaceId, id) { return memoryCases.get(storageId(workspaceId, id)) ?? null; },
    async save(reviewCase) { memoryCases.set(storageId(reviewCase.workspaceId, reviewCase.id), reviewCase); },
    async clearDemo(workspaceId) { for (const [key, item] of memoryCases.entries()) if (item.workspaceId === workspaceId && item.source === "demo") memoryCases.delete(key); },
  };
}

export function createSupabaseReviewStore(config: { url: string; serviceRoleKey: string }, fetchImpl: typeof fetch = fetch): ReviewStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" };
  async function requireSuccess(response: Response, operation: string) {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    throw new Error(`Review persistence ${operation} failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }
  function fromRow(row: { payload: ReviewCase; project_id?: string | null; environment_id?: string | null }): ReviewCase {
    return { ...row.payload, ...(row.project_id ? { projectId: row.project_id } : {}), ...(row.environment_id ? { environmentId: row.environment_id } : {}) };
  }
  return {
    async list(workspaceId, scope) {
      const query = new URLSearchParams({ select: "payload,project_id,environment_id", workspace_id: `eq.${workspaceId}`, order: "updated_at.desc" });
      if (scope?.projectId) query.set("project_id", `eq.${scope.projectId}`);
      if (scope?.environmentId) query.set("environment_id", `eq.${scope.environmentId}`);
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_review_cases?${query}`, { headers });
      await requireSuccess(response, "list");
      const rows = await response.json() as Array<{ payload: ReviewCase; project_id?: string | null; environment_id?: string | null }>;
      return rows.map(fromRow);
    },
    async get(workspaceId, id) {
      const query = new URLSearchParams({ select: "payload,project_id,environment_id", workspace_id: `eq.${workspaceId}`, id: `eq.${storageId(workspaceId, id)}`, limit: "1" });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_review_cases?${query}`, { headers });
      await requireSuccess(response, "get");
      const rows = await response.json() as Array<{ payload: ReviewCase; project_id?: string | null; environment_id?: string | null }>;
      return rows[0] ? fromRow(rows[0]) : null;
    },
    async save(reviewCase) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_review_cases`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: storageId(reviewCase.workspaceId, reviewCase.id), workspace_id: reviewCase.workspaceId,
          project_id: reviewCase.projectId ?? null, environment_id: reviewCase.environmentId ?? null,
          status: reviewCase.status, payload: reviewCase, created_at: reviewCase.createdAt, updated_at: reviewCase.updatedAt,
        }),
      });
      await requireSuccess(response, "save");
    },
    async clearDemo(workspaceId) {
      const query = new URLSearchParams({ workspace_id: `eq.${workspaceId}`, "payload->>source": "eq.demo" });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_review_cases?${query}`, { method: "DELETE", headers });
      await requireSuccess(response, "clear-demo");
    },
  };
}

const memoryStore = createMemoryReviewStore();
export function getReviewStore(): { store: ReviewStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) return { store: createSupabaseReviewStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey }), persistence: "supabase" };
  return { store: memoryStore, persistence: "memory" };
}

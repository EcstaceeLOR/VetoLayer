import type { DecisionReceipt, HumanReviewRecord } from "@vetolayer/core";
import type {
  GitHubGateOperation,
  GitHubIncidentContext,
  GitHubPullRequestSnapshot,
} from "@vetolayer/github-gate";
import { readServerEnvironment } from "./env";

export type GitHubReviewContext = {
  kind: "github";
  snapshot: GitHubPullRequestSnapshot;
  operation: GitHubGateOperation;
  restrictedWindow: boolean;
  incident?: GitHubIncidentContext;
};

export type ReviewCase = {
  id: string;
  workspaceId: string;
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
  list(workspaceId: string): Promise<ReviewCase[]>;
  get(workspaceId: string, id: string): Promise<ReviewCase | null>;
  save(reviewCase: ReviewCase): Promise<void>;
};

const memoryCases = new Map<string, ReviewCase>();

function storageId(workspaceId: string, id: string) {
  return `${workspaceId}:${id}`;
}

export function createMemoryReviewStore(): ReviewStore {
  return {
    async list(workspaceId) {
      return [...memoryCases.values()]
        .filter((item) => item.workspaceId === workspaceId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(workspaceId, id) {
      const item = memoryCases.get(storageId(workspaceId, id));
      return item ?? null;
    },
    async save(reviewCase) {
      memoryCases.set(storageId(reviewCase.workspaceId, reviewCase.id), reviewCase);
    },
  };
}

export function createSupabaseReviewStore(
  config: { url: string; serviceRoleKey: string },
  fetchImpl: typeof fetch = fetch,
): ReviewStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  async function requireSuccess(response: Response, operation: string) {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    throw new Error(`Review persistence ${operation} failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  function fromRow(row: { payload: ReviewCase }): ReviewCase {
    return row.payload;
  }

  return {
    async list(workspaceId) {
      const query = new URLSearchParams({
        select: "payload",
        workspace_id: `eq.${workspaceId}`,
        order: "updated_at.desc",
      });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_review_cases?${query.toString()}`, { headers });
      await requireSuccess(response, "list");
      const rows = (await response.json()) as Array<{ payload: ReviewCase }>;
      return rows.map(fromRow);
    },
    async get(workspaceId, id) {
      const query = new URLSearchParams({
        select: "payload",
        workspace_id: `eq.${workspaceId}`,
        id: `eq.${storageId(workspaceId, id)}`,
        limit: "1",
      });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_review_cases?${query.toString()}`, { headers });
      await requireSuccess(response, "get");
      const rows = (await response.json()) as Array<{ payload: ReviewCase }>;
      return rows[0] ? fromRow(rows[0]) : null;
    },
    async save(reviewCase) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_review_cases`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: storageId(reviewCase.workspaceId, reviewCase.id),
          workspace_id: reviewCase.workspaceId,
          status: reviewCase.status,
          payload: reviewCase,
          created_at: reviewCase.createdAt,
          updated_at: reviewCase.updatedAt,
        }),
      });
      await requireSuccess(response, "save");
    },
  };
}

const memoryStore = createMemoryReviewStore();

export function getReviewStore(): { store: ReviewStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return {
      store: createSupabaseReviewStore({
        url: environment.supabaseUrl,
        serviceRoleKey: environment.supabaseServiceRoleKey,
      }),
      persistence: "supabase",
    };
  }
  return { store: memoryStore, persistence: "memory" };
}

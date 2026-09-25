import type { Actor, DecisionReceipt, Evidence, HumanReviewRecord } from "@vetolayer/core";
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
export type ReviewStatus = "pending" | "awaiting_evidence" | "resolved";
export type ReviewTimelineEventType =
  | "created"
  | "assigned"
  | "unassigned"
  | "commented"
  | "evidence_requested"
  | "evidence_added"
  | "reevaluated"
  | "approved"
  | "rejected"
  | "resolved";

export type ReviewAssignment = {
  userId: string;
  displayName?: string;
  email?: string;
  assignedByUserId: string;
  assignedAt: string;
};

export type ReviewComment = {
  id: string;
  author: Actor;
  body: string;
  createdAt: string;
};

export type ReviewEvidenceAddition = {
  id: string;
  evidence: Evidence;
  addedBy: Actor;
  note?: string;
  addedAt: string;
};

export type ReviewTimelineEvent = {
  id: string;
  type: ReviewTimelineEventType;
  actor?: Actor;
  summary: string;
  createdAt: string;
  receiptId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ReviewReceiptLineage = {
  receiptId: string;
  parentReceiptId?: string;
  outcome: "ALLOW" | "REVIEW" | "BLOCK";
  createdAt: string;
  reason: "initial" | "evidence-change" | "approval" | "rejection";
};

export type ReviewCase = {
  id: string;
  workspaceId: string;
  projectId?: string;
  environmentId?: string;
  revision: number;
  status: ReviewStatus;
  title: string;
  source: "demo" | "api" | "integration";
  receipt: DecisionReceipt;
  context: GitHubReviewContext;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  assignment?: ReviewAssignment;
  comments: ReviewComment[];
  evidenceAdditions: ReviewEvidenceAddition[];
  reviewHistory: HumanReviewRecord[];
  timeline: ReviewTimelineEvent[];
  receiptLineage: ReviewReceiptLineage[];
  review?: HumanReviewRecord;
  resolutionReceipt?: DecisionReceipt;
};

export class ReviewConflictError extends Error {
  current: ReviewCase;
  constructor(current: ReviewCase) {
    super("The review changed after you loaded it. Refresh and review the latest state before retrying.");
    this.name = "ReviewConflictError";
    this.current = current;
  }
}

export type ReviewStore = {
  list(workspaceId: string, scope?: ReviewScope): Promise<ReviewCase[]>;
  get(workspaceId: string, id: string): Promise<ReviewCase | null>;
  save(reviewCase: ReviewCase, options?: { expectedRevision?: number }): Promise<ReviewCase>;
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

function plusHours(value: string, hours: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
}

export function normalizeReviewCase(input: ReviewCase): ReviewCase {
  const initialLineage: ReviewReceiptLineage[] = [{
    receiptId: input.receipt.receiptId,
    outcome: input.receipt.outcome,
    createdAt: input.receipt.timestamps.receiptCreatedAt,
    reason: "initial",
  }];
  if (input.resolutionReceipt && input.resolutionReceipt.receiptId !== input.receipt.receiptId) {
    initialLineage.push({
      receiptId: input.resolutionReceipt.receiptId,
      parentReceiptId: input.receipt.receiptId,
      outcome: input.resolutionReceipt.outcome,
      createdAt: input.resolutionReceipt.timestamps.receiptCreatedAt,
      reason: input.review?.action === "reject" ? "rejection" : "approval",
    });
  }
  const initialTimeline: ReviewTimelineEvent[] = [{
    id: `event_${input.id}_created`,
    type: "created",
    summary: "Review case created from a REVIEW decision.",
    createdAt: input.createdAt,
    receiptId: input.receipt.receiptId,
  }];
  return {
    ...input,
    revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1,
    status: input.status === "resolved" ? "resolved" : input.status === "awaiting_evidence" ? "awaiting_evidence" : "pending",
    dueAt: input.dueAt ?? plusHours(input.createdAt, 24),
    comments: Array.isArray(input.comments) ? input.comments : [],
    evidenceAdditions: Array.isArray(input.evidenceAdditions) ? input.evidenceAdditions : [],
    reviewHistory: Array.isArray(input.reviewHistory) ? input.reviewHistory : input.review ? [input.review] : [],
    timeline: Array.isArray(input.timeline) && input.timeline.length ? input.timeline : initialTimeline,
    receiptLineage: Array.isArray(input.receiptLineage) && input.receiptLineage.length ? input.receiptLineage : initialLineage,
  };
}

export function createMemoryReviewStore(): ReviewStore {
  return {
    async list(workspaceId, scope) {
      return [...memoryCases.values()]
        .filter((item) => item.workspaceId === workspaceId && matchesScope(item, scope))
        .map(normalizeReviewCase)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(workspaceId, id) {
      const item = memoryCases.get(storageId(workspaceId, id));
      return item ? normalizeReviewCase(item) : null;
    },
    async save(reviewCase, options) {
      const key = storageId(reviewCase.workspaceId, reviewCase.id);
      const current = memoryCases.get(key);
      if (options?.expectedRevision !== undefined) {
        if (!current || normalizeReviewCase(current).revision !== options.expectedRevision) {
          if (current) throw new ReviewConflictError(normalizeReviewCase(current));
          throw new Error("Review case not found");
        }
      }
      const next = normalizeReviewCase({
        ...reviewCase,
        revision: current ? normalizeReviewCase(current).revision + 1 : Math.max(1, reviewCase.revision || 1),
      });
      memoryCases.set(key, next);
      return next;
    },
    async clearDemo(workspaceId) {
      for (const [key, item] of memoryCases.entries()) if (item.workspaceId === workspaceId && item.source === "demo") memoryCases.delete(key);
    },
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
  function fromRow(row: { payload: ReviewCase; project_id?: string | null; environment_id?: string | null; revision?: number | null }): ReviewCase {
    return normalizeReviewCase({
      ...row.payload,
      ...(row.project_id ? { projectId: row.project_id } : {}),
      ...(row.environment_id ? { environmentId: row.environment_id } : {}),
      revision: row.revision ?? row.payload.revision ?? 1,
    });
  }
  function rowPayload(reviewCase: ReviewCase, revision: number) {
    const normalized = normalizeReviewCase({ ...reviewCase, revision });
    return {
      status: normalized.status,
      payload: normalized,
      revision,
      assignee_user_id: normalized.assignment?.userId ?? null,
      due_at: normalized.dueAt ?? null,
      updated_at: normalized.updatedAt,
    };
  }
  return {
    async list(workspaceId, scope) {
      const query = new URLSearchParams({ select: "payload,project_id,environment_id,revision", workspace_id: `eq.${workspaceId}`, order: "updated_at.desc" });
      if (scope?.projectId) query.set("project_id", `eq.${scope.projectId}`);
      if (scope?.environmentId) query.set("environment_id", `eq.${scope.environmentId}`);
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_review_cases?${query}`, { headers });
      await requireSuccess(response, "list");
      const rows = await response.json() as Array<{ payload: ReviewCase; project_id?: string | null; environment_id?: string | null; revision?: number | null }>;
      return rows.map(fromRow);
    },
    async get(workspaceId, id) {
      const query = new URLSearchParams({ select: "payload,project_id,environment_id,revision", workspace_id: `eq.${workspaceId}`, id: `eq.${storageId(workspaceId, id)}`, limit: "1" });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_review_cases?${query}`, { headers });
      await requireSuccess(response, "get");
      const rows = await response.json() as Array<{ payload: ReviewCase; project_id?: string | null; environment_id?: string | null; revision?: number | null }>;
      return rows[0] ? fromRow(rows[0]) : null;
    },
    async save(reviewCase, options) {
      const id = storageId(reviewCase.workspaceId, reviewCase.id);
      if (options?.expectedRevision !== undefined) {
        const nextRevision = options.expectedRevision + 1;
        const query = new URLSearchParams({ id: `eq.${id}`, workspace_id: `eq.${reviewCase.workspaceId}`, revision: `eq.${options.expectedRevision}`, select: "payload,project_id,environment_id,revision" });
        const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_review_cases?${query}`, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify(rowPayload(reviewCase, nextRevision)),
        });
        await requireSuccess(response, "compare-and-swap");
        const rows = await response.json() as Array<{ payload: ReviewCase; project_id?: string | null; environment_id?: string | null; revision?: number | null }>;
        if (rows[0]) return fromRow(rows[0]);
        const current = await this.get(reviewCase.workspaceId, reviewCase.id);
        if (current) throw new ReviewConflictError(current);
        throw new Error("Review case not found");
      }

      const normalized = normalizeReviewCase(reviewCase);
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_review_cases`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          id,
          workspace_id: normalized.workspaceId,
          project_id: normalized.projectId ?? null,
          environment_id: normalized.environmentId ?? null,
          ...rowPayload(normalized, normalized.revision),
          created_at: normalized.createdAt,
        }),
      });
      await requireSuccess(response, "save");
      const rows = await response.json() as Array<{ payload: ReviewCase; project_id?: string | null; environment_id?: string | null; revision?: number | null }>;
      return rows[0] ? fromRow(rows[0]) : normalized;
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

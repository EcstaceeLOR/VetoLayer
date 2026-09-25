import type { DecisionReceipt } from "@vetolayer/core";
import { readServerEnvironment } from "./env";

export type DecisionScope = { projectId?: string; environmentId?: string };
export type DecisionReviewState = "none" | "pending" | "awaiting_evidence" | "resolved";
export type DecisionSort = "newest" | "oldest" | "outcome" | "action";

export type DecisionQuery = {
  search?: string;
  outcome?: "ALLOW" | "REVIEW" | "BLOCK";
  projectId?: string;
  environmentId?: string;
  source?: StoredDecision["source"];
  policy?: string;
  serv?: boolean;
  reviewState?: DecisionReviewState;
  from?: string;
  to?: string;
  sort?: DecisionSort;
  page?: number;
  pageSize?: number;
};

export type StoredDecision = {
  id: string;
  workspaceId: string;
  projectId?: string;
  environmentId?: string;
  source: "demo" | "api" | "integration";
  receipt: DecisionReceipt;
  createdAt: string;
  reviewState?: DecisionReviewState;
  reviewCaseId?: string;
  parentReceiptId?: string;
};

export type DecisionPage = {
  decisions: StoredDecision[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export type DecisionStore = {
  save(record: StoredDecision): Promise<void>;
  get(workspaceId: string, id: string): Promise<StoredDecision | null>;
  list(workspaceId: string, limit?: number, scope?: DecisionScope): Promise<StoredDecision[]>;
  query(workspaceId: string, query: DecisionQuery): Promise<DecisionPage>;
  lineage(workspaceId: string, requestId: string): Promise<StoredDecision[]>;
  annotateReview(workspaceId: string, receiptIds: string[], input: { state: DecisionReviewState; reviewCaseId?: string }): Promise<void>;
  clearDemo(workspaceId: string): Promise<void>;
};

const memoryDecisions = new Map<string, StoredDecision>();

function storageId(workspaceId: string, id: string) {
  return `${workspaceId}:${id}`;
}

function matchesScope(record: StoredDecision, scope?: DecisionScope) {
  if (!scope) return true;
  if (scope.projectId && record.projectId !== scope.projectId) return false;
  if (scope.environmentId && record.environmentId !== scope.environmentId) return false;
  return true;
}

function safePage(value: number | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

function safePageSize(value: number | undefined) {
  return Number.isInteger(value) ? Math.max(1, Math.min(100, Number(value))) : 25;
}

function logicalPolicyId(value: string) {
  return value.replace(/@v\d+$/i, "");
}

function decisionIndex(record: StoredDecision) {
  const receipt = record.receipt;
  const policyRefs = [...new Set(receipt.policiesEvaluated.map((policy) => policy.id))];
  const policyKeys = [...new Set(policyRefs.map(logicalPolicyId))];
  const usesServ = receipt.contextualFindings.length > 0 || Boolean(receipt.providerTrace);
  const searchText = [
    receipt.receiptId,
    receipt.decisionId,
    receipt.action.requestId,
    receipt.action.type,
    receipt.action.tool,
    receipt.action.operation,
    receipt.action.targetType,
    receipt.action.targetId,
    receipt.action.environment,
    receipt.actor.id,
    receipt.actor.name,
    receipt.actor.framework,
    receipt.decisionSummary,
    ...receipt.policiesEvaluated.flatMap((policy) => [policy.id, policy.name]),
  ].filter(Boolean).join(" ").toLowerCase().slice(0, 20_000);
  return { policyRefs, policyKeys, usesServ, searchText };
}

function matchesQuery(record: StoredDecision, query: DecisionQuery) {
  const index = decisionIndex(record);
  if (query.outcome && record.receipt.outcome !== query.outcome) return false;
  if (query.projectId && record.projectId !== query.projectId) return false;
  if (query.environmentId && record.environmentId !== query.environmentId) return false;
  if (query.source && record.source !== query.source) return false;
  if (query.policy && !index.policyKeys.includes(query.policy) && !index.policyRefs.includes(query.policy)) return false;
  if (query.serv !== undefined && index.usesServ !== query.serv) return false;
  if (query.reviewState && (record.reviewState ?? "none") !== query.reviewState) return false;
  if (query.from && record.createdAt < query.from) return false;
  if (query.to && record.createdAt > query.to) return false;
  if (query.search && !index.searchText.includes(query.search.trim().toLowerCase())) return false;
  return true;
}

function sortRecords(records: StoredDecision[], sort: DecisionSort = "newest") {
  return [...records].sort((left, right) => {
    if (sort === "oldest") return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
    if (sort === "outcome") return left.receipt.outcome.localeCompare(right.receipt.outcome) || right.createdAt.localeCompare(left.createdAt);
    if (sort === "action") return left.receipt.action.operation.localeCompare(right.receipt.action.operation) || right.createdAt.localeCompare(left.createdAt);
    return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
  });
}

function pageRecords(records: StoredDecision[], query: DecisionQuery): DecisionPage {
  const page = safePage(query.page);
  const pageSize = safePageSize(query.pageSize);
  const filtered = sortRecords(records.filter((record) => matchesQuery(record, query)), query.sort);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;
  const decisions = filtered.slice(start, start + pageSize);
  return {
    decisions,
    page: normalizedPage,
    pageSize,
    total,
    totalPages,
    hasNext: normalizedPage < totalPages,
    hasPrevious: normalizedPage > 1,
  };
}

export function createMemoryDecisionStore(): DecisionStore {
  return {
    async save(record) { memoryDecisions.set(storageId(record.workspaceId, record.id), record); },
    async get(workspaceId, id) {
      const direct = memoryDecisions.get(storageId(workspaceId, id));
      if (direct) return direct;
      return [...memoryDecisions.values()].find((record) => record.workspaceId === workspaceId && record.receipt.decisionId === id) ?? null;
    },
    async list(workspaceId, limit = 50, scope) {
      return sortRecords([...memoryDecisions.values()].filter((item) => item.workspaceId === workspaceId && matchesScope(item, scope)))
        .slice(0, Math.max(1, Math.min(200, Math.trunc(limit))));
    },
    async query(workspaceId, query) {
      return pageRecords([...memoryDecisions.values()].filter((item) => item.workspaceId === workspaceId), query);
    },
    async lineage(workspaceId, requestId) {
      return [...memoryDecisions.values()]
        .filter((item) => item.workspaceId === workspaceId && item.receipt.action.requestId === requestId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async annotateReview(workspaceId, receiptIds, input) {
      const ids = new Set(receiptIds);
      for (const [key, record] of memoryDecisions.entries()) {
        if (record.workspaceId !== workspaceId || !ids.has(record.receipt.receiptId)) continue;
        memoryDecisions.set(key, { ...record, reviewState: input.state, ...(input.reviewCaseId ? { reviewCaseId: input.reviewCaseId } : {}) });
      }
    },
    async clearDemo(workspaceId) {
      for (const [key, record] of memoryDecisions.entries()) {
        if (record.workspaceId === workspaceId && record.source === "demo") memoryDecisions.delete(key);
      }
    },
  };
}

type DecisionRow = {
  id: string;
  workspace_id: string;
  project_id?: string | null;
  environment_id?: string | null;
  source: StoredDecision["source"];
  receipt: DecisionReceipt;
  created_at: string;
  review_state?: DecisionReviewState | null;
  review_case_id?: string | null;
  parent_receipt_id?: string | null;
};

export function createSupabaseDecisionStore(config: { url: string; serviceRoleKey: string }, fetchImpl: typeof fetch = fetch): DecisionStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" };
  const select = "id,workspace_id,project_id,environment_id,source,receipt,created_at,review_state,review_case_id,parent_receipt_id";

  async function requireSuccess(response: Response, operation: string) {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    throw new Error(`Decision persistence ${operation} failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  function mapRow(row: DecisionRow): StoredDecision {
    return {
      id: row.receipt.receiptId,
      workspaceId: row.workspace_id,
      ...(row.project_id ? { projectId: row.project_id } : {}),
      ...(row.environment_id ? { environmentId: row.environment_id } : {}),
      source: row.source,
      receipt: row.receipt,
      createdAt: row.created_at,
      ...(row.review_state ? { reviewState: row.review_state } : {}),
      ...(row.review_case_id ? { reviewCaseId: row.review_case_id } : {}),
      ...(row.parent_receipt_id ? { parentReceiptId: row.parent_receipt_id } : {}),
    };
  }

  return {
    async save(record) {
      const index = decisionIndex(record);
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_decisions`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: storageId(record.workspaceId, record.id),
          workspace_id: record.workspaceId,
          project_id: record.projectId ?? null,
          environment_id: record.environmentId ?? null,
          source: record.source,
          receipt: record.receipt,
          created_at: record.createdAt,
          receipt_id: record.receipt.receiptId,
          decision_id: record.receipt.decisionId,
          request_id: record.receipt.action.requestId,
          action_operation: record.receipt.action.operation,
          action_tool: record.receipt.action.tool,
          actor_id: record.receipt.actor.id,
          actor_name: record.receipt.actor.name ?? null,
          target_id: record.receipt.action.targetId ?? record.receipt.action.targetType,
          outcome: record.receipt.outcome,
          uses_serv: index.usesServ,
          policy_refs: index.policyRefs,
          policy_keys: index.policyKeys,
          search_text: index.searchText,
          review_state: record.reviewState ?? "none",
          review_case_id: record.reviewCaseId ?? null,
          parent_receipt_id: record.parentReceiptId ?? null,
        }),
      });
      await requireSuccess(response, "save");
    },

    async get(workspaceId, id) {
      const directQuery = new URLSearchParams({ select, workspace_id: `eq.${workspaceId}`, receipt_id: `eq.${id}`, limit: "1" });
      let response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_decisions?${directQuery}`, { headers });
      await requireSuccess(response, "get");
      let rows = await response.json() as DecisionRow[];
      if (rows[0]) return mapRow(rows[0]);
      const decisionQuery = new URLSearchParams({ select, workspace_id: `eq.${workspaceId}`, decision_id: `eq.${id}`, limit: "1" });
      response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_decisions?${decisionQuery}`, { headers });
      await requireSuccess(response, "get-by-decision-id");
      rows = await response.json() as DecisionRow[];
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async list(workspaceId, limit = 50, scope) {
      const result = await this.query(workspaceId, { projectId: scope?.projectId, environmentId: scope?.environmentId, page: 1, pageSize: Math.max(1, Math.min(100, Math.trunc(limit))) });
      if (limit <= 100) return result.decisions;
      const second = await this.query(workspaceId, { projectId: scope?.projectId, environmentId: scope?.environmentId, page: 2, pageSize: Math.min(100, Math.trunc(limit) - 100) });
      return [...result.decisions, ...second.decisions].slice(0, Math.min(200, Math.trunc(limit)));
    },

    async query(workspaceId, input) {
      const page = safePage(input.page);
      const pageSize = safePageSize(input.pageSize);
      const offset = (page - 1) * pageSize;
      const query = new URLSearchParams({ select, workspace_id: `eq.${workspaceId}`, limit: String(pageSize), offset: String(offset) });
      if (input.projectId) query.set("project_id", `eq.${input.projectId}`);
      if (input.environmentId) query.set("environment_id", `eq.${input.environmentId}`);
      if (input.outcome) query.set("outcome", `eq.${input.outcome}`);
      if (input.source) query.set("source", `eq.${input.source}`);
      if (input.serv !== undefined) query.set("uses_serv", `eq.${String(input.serv)}`);
      if (input.reviewState) query.set("review_state", `eq.${input.reviewState}`);
      if (input.from) query.set("created_at", `gte.${input.from}`);
      if (input.to) query.append("created_at", `lte.${input.to}`);
      if (input.policy) {
        const policy = input.policy.replace(/[{},\"]/g, "").trim();
        if (policy) query.set("policy_keys", `cs.{${policy}}`);
      }
      if (input.search?.trim()) {
        const search = input.search.trim().replace(/[,*()]/g, " ").replace(/\s+/g, " ").slice(0, 200).toLowerCase();
        if (search) query.set("search_text", `ilike.*${search}*`);
      }
      const order = input.sort === "oldest"
        ? "created_at.asc,id.asc"
        : input.sort === "outcome"
          ? "outcome.asc,created_at.desc"
          : input.sort === "action"
            ? "action_operation.asc,created_at.desc"
            : "created_at.desc,id.desc";
      query.set("order", order);
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_decisions?${query}`, { headers: { ...headers, Prefer: "count=exact" } });
      await requireSuccess(response, "query");
      const rows = await response.json() as DecisionRow[];
      const contentRange = response.headers.get("content-range");
      const totalToken = contentRange?.split("/")[1];
      const total = totalToken && totalToken !== "*" ? Number(totalToken) : offset + rows.length + (rows.length === pageSize ? 1 : 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return {
        decisions: rows.map(mapRow),
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      };
    },

    async lineage(workspaceId, requestId) {
      const query = new URLSearchParams({ select, workspace_id: `eq.${workspaceId}`, request_id: `eq.${requestId}`, order: "created_at.asc,id.asc", limit: "500" });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_decisions?${query}`, { headers });
      await requireSuccess(response, "lineage");
      const rows = await response.json() as DecisionRow[];
      return rows.map(mapRow);
    },

    async annotateReview(workspaceId, receiptIds, input) {
      const safeIds = [...new Set(receiptIds.filter(Boolean))];
      if (!safeIds.length) return;
      const encoded = safeIds.map((id) => `"${id.replace(/["\\]/g, "")}"`).join(",");
      const query = new URLSearchParams({ workspace_id: `eq.${workspaceId}`, receipt_id: `in.(${encoded})` });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_decisions?${query}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ review_state: input.state, ...(input.reviewCaseId ? { review_case_id: input.reviewCaseId } : {}) }),
      });
      await requireSuccess(response, "annotate-review");
    },

    async clearDemo(workspaceId) {
      const query = new URLSearchParams({ workspace_id: `eq.${workspaceId}`, source: "eq.demo" });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_decisions?${query}`, { method: "DELETE", headers });
      await requireSuccess(response, "clear-demo");
    },
  };
}

const memoryStore = createMemoryDecisionStore();

export function getDecisionStore(): { store: DecisionStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return { store: createSupabaseDecisionStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey }), persistence: "supabase" };
  }
  return { store: memoryStore, persistence: "memory" };
}

export function getOptionalDecisionStore(): DecisionStore | null {
  const result = getDecisionStore();
  return result.persistence === "supabase" ? result.store : null;
}

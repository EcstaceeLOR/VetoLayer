import { randomUUID } from "node:crypto";
import { readServerEnvironment } from "./env";

export type AuditActorKind = "human" | "service" | "system";
export type AuditCategory = "security" | "workspace" | "member" | "project" | "environment" | "credential" | "integration" | "policy" | "review" | "webhook" | "settings";

export type AuditEvent = {
  id: string;
  workspaceId: string;
  projectId?: string;
  environmentId?: string;
  actorKind: AuditActorKind;
  actorUserId?: string;
  actorLabel?: string;
  actorRole?: string;
  action: string;
  category: AuditCategory;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  href?: string;
  requestId?: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AuditFilter = {
  actor?: string;
  action?: string;
  resource?: string;
  projectId?: string;
  environmentId?: string;
  from?: string;
  to?: string;
  before?: string;
  limit?: number;
};

export type AuditStore = {
  append(input: Omit<AuditEvent, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<AuditEvent>;
  list(workspaceId: string, filter?: AuditFilter): Promise<AuditEvent[]>;
};

function boundedLimit(value: number | undefined) {
  if (!Number.isInteger(value)) return 100;
  return Math.max(1, Math.min(5_000, Number(value)));
}

function matchesText(value: string | undefined, query: string | undefined) {
  if (!query) return true;
  return (value ?? "").toLowerCase().includes(query.toLowerCase());
}

export function createMemoryAuditStore(): AuditStore {
  const events = new Map<string, AuditEvent>();
  return {
    async append(input) {
      const event: AuditEvent = {
        ...input,
        id: input.id ?? `audit_${randomUUID()}`,
        createdAt: input.createdAt ?? new Date().toISOString(),
      };
      events.set(event.id, event);
      return event;
    },
    async list(workspaceId, filter = {}) {
      const from = filter.from ? Date.parse(filter.from) : Number.NEGATIVE_INFINITY;
      const to = filter.to ? Date.parse(filter.to) : Number.POSITIVE_INFINITY;
      const before = filter.before ? Date.parse(filter.before) : Number.POSITIVE_INFINITY;
      return [...events.values()]
        .filter((event) => {
          if (event.workspaceId !== workspaceId) return false;
          if (filter.projectId && event.projectId !== filter.projectId) return false;
          if (filter.environmentId && event.environmentId !== filter.environmentId) return false;
          const timestamp = Date.parse(event.createdAt);
          if (Number.isFinite(from) && timestamp < from) return false;
          if (Number.isFinite(to) && timestamp > to) return false;
          if (Number.isFinite(before) && timestamp >= before) return false;
          if (filter.actor && !matchesText(`${event.actorUserId ?? ""} ${event.actorLabel ?? ""}`, filter.actor)) return false;
          if (filter.action && !matchesText(event.action, filter.action)) return false;
          if (filter.resource && !matchesText(`${event.targetType} ${event.targetId ?? ""} ${event.targetLabel ?? ""}`, filter.resource)) return false;
          return true;
        })
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
        .slice(0, boundedLimit(filter.limit));
    },
  };
}

type Row = Record<string, unknown>;

function rowToEvent(row: Row): AuditEvent {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    ...(row.project_id ? { projectId: String(row.project_id) } : {}),
    ...(row.environment_id ? { environmentId: String(row.environment_id) } : {}),
    actorKind: String(row.actor_kind) as AuditActorKind,
    ...(row.actor_user_id ? { actorUserId: String(row.actor_user_id) } : {}),
    ...(row.actor_label ? { actorLabel: String(row.actor_label) } : {}),
    ...(row.actor_role ? { actorRole: String(row.actor_role) } : {}),
    action: String(row.action),
    category: String(row.category) as AuditCategory,
    targetType: String(row.target_type),
    ...(row.target_id ? { targetId: String(row.target_id) } : {}),
    ...(row.target_label ? { targetLabel: String(row.target_label) } : {}),
    ...(row.href ? { href: String(row.href) } : {}),
    ...(row.request_id ? { requestId: String(row.request_id) } : {}),
    ...(row.correlation_id ? { correlationId: String(row.correlation_id) } : {}),
    ...(row.ip_address ? { ipAddress: String(row.ip_address) } : {}),
    ...(row.user_agent ? { userAgent: String(row.user_agent) } : {}),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
    createdAt: String(row.created_at),
  };
}

function authHeaders(serviceRoleKey: string) {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
}

export function createSupabaseAuditStore(config: { url: string; serviceRoleKey: string }, fetchImpl: typeof fetch = fetch): AuditStore {
  const base = config.url.replace(/\/+$/, "");
  const headers = authHeaders(config.serviceRoleKey);
  async function request(path: string, init?: RequestInit) {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) }, cache: "no-store" });
    if (!response.ok) throw new Error(`Audit persistence request failed (${response.status}).`);
    return response;
  }
  return {
    async append(input) {
      const event: AuditEvent = { ...input, id: input.id ?? `audit_${randomUUID()}`, createdAt: input.createdAt ?? new Date().toISOString() };
      const response = await request("vetolayer_audit_events?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          id: event.id,
          workspace_id: event.workspaceId,
          project_id: event.projectId ?? null,
          environment_id: event.environmentId ?? null,
          actor_kind: event.actorKind,
          actor_user_id: event.actorUserId ?? null,
          actor_label: event.actorLabel ?? null,
          actor_role: event.actorRole ?? null,
          action: event.action,
          category: event.category,
          target_type: event.targetType,
          target_id: event.targetId ?? null,
          target_label: event.targetLabel ?? null,
          href: event.href ?? null,
          request_id: event.requestId ?? null,
          correlation_id: event.correlationId ?? null,
          ip_address: event.ipAddress ?? null,
          user_agent: event.userAgent ?? null,
          metadata: event.metadata,
          created_at: event.createdAt,
        }),
      });
      const rows = await response.json() as Row[];
      if (!rows[0]) throw new Error("Audit event was not returned after insertion.");
      return rowToEvent(rows[0]);
    },
    async list(workspaceId, filter = {}) {
      const query = new URLSearchParams({ workspace_id: `eq.${workspaceId}`, select: "*", order: "created_at.desc,id.desc", limit: String(boundedLimit(filter.limit)) });
      if (filter.projectId) query.set("project_id", `eq.${filter.projectId}`);
      if (filter.environmentId) query.set("environment_id", `eq.${filter.environmentId}`);
      if (filter.action) query.set("action", `ilike.*${filter.action.replaceAll("*", "")}*`);
      if (filter.from) query.set("created_at", `gte.${filter.from}`);
      if (filter.to) query.append("created_at", `lte.${filter.to}`);
      if (filter.before) query.append("created_at", `lt.${filter.before}`);
      if (filter.actor) {
        const safe = filter.actor.replace(/[(),*]/g, "");
        query.set("or", `(actor_user_id.ilike.*${safe}*,actor_label.ilike.*${safe}*)`);
      }
      if (filter.resource) {
        const safe = filter.resource.replace(/[(),*]/g, "");
        query.set("and", `(or(target_type.ilike.*${safe}*,target_id.ilike.*${safe}*,target_label.ilike.*${safe}*))`);
      }
      const rows = await (await request(`vetolayer_audit_events?${query.toString()}`)).json() as Row[];
      return rows.map(rowToEvent);
    },
  };
}

const memoryStore = createMemoryAuditStore();
let cached: { key: string; value: { store: AuditStore; persistence: "supabase" | "memory" } } | null = null;

export function getAuditStore(): { store: AuditStore; persistence: "supabase" | "memory" } {
  const env = readServerEnvironment();
  if (!env.persistenceConfigured || !env.supabaseUrl || !env.supabaseServiceRoleKey) return { store: memoryStore, persistence: "memory" };
  const key = `${env.supabaseUrl}:${env.supabaseServiceRoleKey.slice(-8)}`;
  if (!cached || cached.key !== key) cached = { key, value: { store: createSupabaseAuditStore({ url: env.supabaseUrl, serviceRoleKey: env.supabaseServiceRoleKey }), persistence: "supabase" } };
  return cached.value;
}

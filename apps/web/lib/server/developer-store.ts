import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ProductScope } from "../workspace-model";
import { readServerEnvironment } from "./env";

export type DeveloperKeyPermission = "evaluate" | "read:decisions" | "webhooks";

export type StoredDeveloperApiKey = ProductScope & {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  permissions: DeveloperKeyPermission[];
  status: "active" | "revoked";
  createdByUserId: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

export type StoredDeveloperWebhook = ProductScope & {
  id: string;
  name: string;
  url: string;
  events: string[];
  secretCiphertext: string;
  status: "active" | "revoked";
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt?: string;
};

export type StoredWebhookDelivery = ProductScope & {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  payload: Record<string, unknown>;
  statusCode?: number;
  error?: string;
  createdAt: string;
  deliveredAt?: string;
};

export type StoredDeveloperRequest = ProductScope & {
  id: string;
  requestId: string;
  keyId?: string;
  actionId: string;
  outcome: "ALLOW" | "REVIEW" | "BLOCK";
  receiptId?: string;
  latencyMs: number;
  createdAt: string;
};

export type DeveloperStore = {
  createApiKey(input: ProductScope & { name: string; permissions: DeveloperKeyPermission[]; createdByUserId: string }): Promise<{ record: StoredDeveloperApiKey; secret: string }>;
  listApiKeys(scope: ProductScope): Promise<StoredDeveloperApiKey[]>;
  getApiKey(scope: ProductScope, id: string): Promise<StoredDeveloperApiKey | null>;
  findActiveApiKeyBySecret(secret: string): Promise<StoredDeveloperApiKey | null>;
  revokeApiKey(scope: ProductScope, id: string, now?: string): Promise<void>;
  rotateApiKey(scope: ProductScope, id: string, createdByUserId: string): Promise<{ record: StoredDeveloperApiKey; secret: string }>;
  touchApiKey(id: string, lastUsedAt: string): Promise<void>;
  createWebhook(input: ProductScope & { name: string; url: string; events: string[]; secretCiphertext: string; createdByUserId: string }): Promise<StoredDeveloperWebhook>;
  listWebhooks(scope: ProductScope): Promise<StoredDeveloperWebhook[]>;
  getWebhook(scope: ProductScope, id: string): Promise<StoredDeveloperWebhook | null>;
  revokeWebhook(scope: ProductScope, id: string, now?: string): Promise<void>;
  rotateWebhookSecret(scope: ProductScope, id: string, secretCiphertext: string, now?: string): Promise<void>;
  saveWebhookDelivery(delivery: StoredWebhookDelivery): Promise<void>;
  listWebhookDeliveries(scope: ProductScope, limit?: number): Promise<StoredWebhookDelivery[]>;
  saveRequest(record: StoredDeveloperRequest): Promise<void>;
  listRequests(scope: ProductScope, limit?: number): Promise<StoredDeveloperRequest[]>;
};

const memoryKeys = new Map<string, StoredDeveloperApiKey>();
const memoryWebhooks = new Map<string, StoredDeveloperWebhook>();
const memoryDeliveries = new Map<string, StoredWebhookDelivery>();
const memoryRequests = new Map<string, StoredDeveloperRequest>();

export function developerSecretHash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function scopeMatches(record: ProductScope, scope: ProductScope) {
  return record.workspaceId === scope.workspaceId && record.projectId === scope.projectId && record.environmentId === scope.environmentId;
}

function createKeyMaterial() {
  const secret = `vl_live_${randomBytes(24).toString("base64url")}`;
  return { secret, keyPrefix: `${secret.slice(0, 15)}…`, keyHash: developerSecretHash(secret) };
}

export function createMemoryDeveloperStore(): DeveloperStore {
  return {
    async createApiKey(input) {
      const now = new Date().toISOString();
      const material = createKeyMaterial();
      const record: StoredDeveloperApiKey = {
        id: `key_${randomUUID()}`,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        name: input.name,
        keyPrefix: material.keyPrefix,
        keyHash: material.keyHash,
        permissions: [...new Set(input.permissions)],
        status: "active",
        createdByUserId: input.createdByUserId,
        createdAt: now,
      };
      memoryKeys.set(record.id, record);
      return { record, secret: material.secret };
    },
    async listApiKeys(scope) {
      return [...memoryKeys.values()].filter((record) => scopeMatches(record, scope)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getApiKey(scope, id) {
      const record = memoryKeys.get(id);
      return record && scopeMatches(record, scope) ? record : null;
    },
    async findActiveApiKeyBySecret(secret) {
      const hash = developerSecretHash(secret);
      return [...memoryKeys.values()].find((record) => record.keyHash === hash && record.status === "active") ?? null;
    },
    async revokeApiKey(scope, id, now = new Date().toISOString()) {
      const record = memoryKeys.get(id);
      if (!record || !scopeMatches(record, scope)) return;
      memoryKeys.set(id, { ...record, status: "revoked", revokedAt: now });
    },
    async rotateApiKey(scope, id, createdByUserId) {
      const previous = await this.getApiKey(scope, id);
      if (!previous) throw new Error("API key not found");
      await this.revokeApiKey(scope, id);
      return this.createApiKey({ ...scope, name: previous.name, permissions: previous.permissions, createdByUserId });
    },
    async touchApiKey(id, lastUsedAt) {
      const record = memoryKeys.get(id);
      if (record) memoryKeys.set(id, { ...record, lastUsedAt });
    },
    async createWebhook(input) {
      const now = new Date().toISOString();
      const record: StoredDeveloperWebhook = {
        id: `wh_${randomUUID()}`,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        name: input.name,
        url: input.url,
        events: [...new Set(input.events)],
        secretCiphertext: input.secretCiphertext,
        status: "active",
        createdByUserId: input.createdByUserId,
        createdAt: now,
        updatedAt: now,
      };
      memoryWebhooks.set(record.id, record);
      return record;
    },
    async listWebhooks(scope) {
      return [...memoryWebhooks.values()].filter((record) => scopeMatches(record, scope)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getWebhook(scope, id) {
      const record = memoryWebhooks.get(id);
      return record && scopeMatches(record, scope) ? record : null;
    },
    async revokeWebhook(scope, id, now = new Date().toISOString()) {
      const record = memoryWebhooks.get(id);
      if (!record || !scopeMatches(record, scope)) return;
      memoryWebhooks.set(id, { ...record, status: "revoked", updatedAt: now });
    },
    async rotateWebhookSecret(scope, id, secretCiphertext, now = new Date().toISOString()) {
      const record = memoryWebhooks.get(id);
      if (!record || !scopeMatches(record, scope)) throw new Error("Webhook not found");
      memoryWebhooks.set(id, { ...record, secretCiphertext, updatedAt: now });
    },
    async saveWebhookDelivery(delivery) { memoryDeliveries.set(delivery.id, delivery); },
    async listWebhookDeliveries(scope, limit = 30) {
      return [...memoryDeliveries.values()].filter((record) => scopeMatches(record, scope)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },
    async saveRequest(record) { memoryRequests.set(record.id, record); },
    async listRequests(scope, limit = 30) {
      return [...memoryRequests.values()].filter((record) => scopeMatches(record, scope)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },
  };
}

type Row = Record<string, unknown>;

function supabaseHeaders(serviceRoleKey: string) {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
}

export function createSupabaseDeveloperStore(config: { url: string; serviceRoleKey: string }, fetchImpl: typeof fetch = fetch): DeveloperStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = supabaseHeaders(config.serviceRoleKey);
  async function request(path: string, init?: RequestInit) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) }, cache: "no-store" });
    if (!response.ok) throw new Error(`Developer persistence request failed with status ${response.status}.`);
    return response;
  }
  async function rows(path: string) { return await (await request(path)).json() as Row[]; }
  function keyFromRow(row: Row): StoredDeveloperApiKey {
    return {
      id: String(row.id), workspaceId: String(row.workspace_id), projectId: String(row.project_id), environmentId: String(row.environment_id),
      name: String(row.name), keyPrefix: String(row.key_prefix), keyHash: String(row.key_hash), permissions: Array.isArray(row.permissions) ? row.permissions as DeveloperKeyPermission[] : [],
      status: row.status === "revoked" ? "revoked" : "active", createdByUserId: String(row.created_by_user_id), createdAt: String(row.created_at),
      ...(row.last_used_at ? { lastUsedAt: String(row.last_used_at) } : {}), ...(row.revoked_at ? { revokedAt: String(row.revoked_at) } : {}),
    };
  }
  function webhookFromRow(row: Row): StoredDeveloperWebhook {
    return {
      id: String(row.id), workspaceId: String(row.workspace_id), projectId: String(row.project_id), environmentId: String(row.environment_id), name: String(row.name),
      url: String(row.url), events: Array.isArray(row.events) ? row.events.map(String) : [], secretCiphertext: String(row.secret_ciphertext), status: row.status === "revoked" ? "revoked" : "active",
      createdByUserId: String(row.created_by_user_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at), ...(row.last_delivery_at ? { lastDeliveryAt: String(row.last_delivery_at) } : {}),
    };
  }
  function deliveryFromRow(row: Row): StoredWebhookDelivery {
    return {
      id: String(row.id), endpointId: String(row.endpoint_id), workspaceId: String(row.workspace_id), projectId: String(row.project_id), environmentId: String(row.environment_id),
      eventId: String(row.event_id), eventType: String(row.event_type), status: String(row.status) as StoredWebhookDelivery["status"], attempts: Number(row.attempts ?? 0),
      payload: row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {}, ...(row.status_code !== null && row.status_code !== undefined ? { statusCode: Number(row.status_code) } : {}),
      ...(row.error ? { error: String(row.error) } : {}), createdAt: String(row.created_at), ...(row.delivered_at ? { deliveredAt: String(row.delivered_at) } : {}),
    };
  }
  function requestFromRow(row: Row): StoredDeveloperRequest {
    return {
      id: String(row.id), workspaceId: String(row.workspace_id), projectId: String(row.project_id), environmentId: String(row.environment_id), requestId: String(row.request_id),
      ...(row.key_id ? { keyId: String(row.key_id) } : {}), actionId: String(row.action_id), outcome: String(row.outcome) as StoredDeveloperRequest["outcome"],
      ...(row.receipt_id ? { receiptId: String(row.receipt_id) } : {}), latencyMs: Number(row.latency_ms ?? 0), createdAt: String(row.created_at),
    };
  }
  const scopeQuery = (scope: ProductScope) => new URLSearchParams({ workspace_id: `eq.${scope.workspaceId}`, project_id: `eq.${scope.projectId}`, environment_id: `eq.${scope.environmentId}` });

  return {
    async createApiKey(input) {
      const now = new Date().toISOString();
      const material = createKeyMaterial();
      const record: StoredDeveloperApiKey = { id: `key_${randomUUID()}`, workspaceId: input.workspaceId, projectId: input.projectId, environmentId: input.environmentId, name: input.name, keyPrefix: material.keyPrefix, keyHash: material.keyHash, permissions: [...new Set(input.permissions)], status: "active", createdByUserId: input.createdByUserId, createdAt: now };
      await request("vetolayer_api_keys", { method: "POST", body: JSON.stringify({ id: record.id, workspace_id: record.workspaceId, project_id: record.projectId, environment_id: record.environmentId, name: record.name, key_prefix: record.keyPrefix, key_hash: record.keyHash, permissions: record.permissions, status: record.status, created_by_user_id: record.createdByUserId, created_at: record.createdAt }) });
      return { record, secret: material.secret };
    },
    async listApiKeys(scope) { const q = scopeQuery(scope); q.set("select", "*"); q.set("order", "created_at.desc"); return (await rows(`vetolayer_api_keys?${q}`)).map(keyFromRow); },
    async getApiKey(scope, id) { const q = scopeQuery(scope); q.set("id", `eq.${id}`); q.set("select", "*"); q.set("limit", "1"); const found = await rows(`vetolayer_api_keys?${q}`); return found[0] ? keyFromRow(found[0]) : null; },
    async findActiveApiKeyBySecret(secret) {
      const hash = developerSecretHash(secret);
      const q = new URLSearchParams({ key_hash: `eq.${hash}`, status: "eq.active", select: "*", limit: "1" });
      const found = await rows(`vetolayer_api_keys?${q}`);
      return found[0] ? keyFromRow(found[0]) : null;
    },
    async revokeApiKey(scope, id, now = new Date().toISOString()) { const q = scopeQuery(scope); q.set("id", `eq.${id}`); await request(`vetolayer_api_keys?${q}`, { method: "PATCH", body: JSON.stringify({ status: "revoked", revoked_at: now }) }); },
    async rotateApiKey(scope, id, createdByUserId) { const previous = await this.getApiKey(scope, id); if (!previous) throw new Error("API key not found"); await this.revokeApiKey(scope, id); return this.createApiKey({ ...scope, name: previous.name, permissions: previous.permissions, createdByUserId }); },
    async touchApiKey(id, lastUsedAt) { await request(`vetolayer_api_keys?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ last_used_at: lastUsedAt }) }); },
    async createWebhook(input) {
      const now = new Date().toISOString();
      const record: StoredDeveloperWebhook = { id: `wh_${randomUUID()}`, workspaceId: input.workspaceId, projectId: input.projectId, environmentId: input.environmentId, name: input.name, url: input.url, events: [...new Set(input.events)], secretCiphertext: input.secretCiphertext, status: "active", createdByUserId: input.createdByUserId, createdAt: now, updatedAt: now };
      await request("vetolayer_webhook_endpoints", { method: "POST", body: JSON.stringify({ id: record.id, workspace_id: record.workspaceId, project_id: record.projectId, environment_id: record.environmentId, name: record.name, url: record.url, events: record.events, secret_ciphertext: record.secretCiphertext, status: record.status, created_by_user_id: record.createdByUserId, created_at: record.createdAt, updated_at: record.updatedAt }) });
      return record;
    },
    async listWebhooks(scope) { const q = scopeQuery(scope); q.set("select", "*"); q.set("order", "created_at.desc"); return (await rows(`vetolayer_webhook_endpoints?${q}`)).map(webhookFromRow); },
    async getWebhook(scope, id) { const q = scopeQuery(scope); q.set("id", `eq.${id}`); q.set("select", "*"); q.set("limit", "1"); const found = await rows(`vetolayer_webhook_endpoints?${q}`); return found[0] ? webhookFromRow(found[0]) : null; },
    async revokeWebhook(scope, id, now = new Date().toISOString()) { const q = scopeQuery(scope); q.set("id", `eq.${id}`); await request(`vetolayer_webhook_endpoints?${q}`, { method: "PATCH", body: JSON.stringify({ status: "revoked", updated_at: now }) }); },
    async rotateWebhookSecret(scope, id, secretCiphertext, now = new Date().toISOString()) { const q = scopeQuery(scope); q.set("id", `eq.${id}`); await request(`vetolayer_webhook_endpoints?${q}`, { method: "PATCH", body: JSON.stringify({ secret_ciphertext: secretCiphertext, updated_at: now }) }); },
    async saveWebhookDelivery(delivery) { await request("vetolayer_webhook_deliveries", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: delivery.id, endpoint_id: delivery.endpointId, workspace_id: delivery.workspaceId, project_id: delivery.projectId, environment_id: delivery.environmentId, event_id: delivery.eventId, event_type: delivery.eventType, status: delivery.status, attempts: delivery.attempts, payload: delivery.payload, status_code: delivery.statusCode ?? null, error: delivery.error ?? null, created_at: delivery.createdAt, delivered_at: delivery.deliveredAt ?? null }) }); },
    async listWebhookDeliveries(scope, limit = 30) { const q = scopeQuery(scope); q.set("select", "*"); q.set("order", "created_at.desc"); q.set("limit", String(limit)); return (await rows(`vetolayer_webhook_deliveries?${q}`)).map(deliveryFromRow); },
    async saveRequest(record) { await request("vetolayer_api_requests", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: record.id, workspace_id: record.workspaceId, project_id: record.projectId, environment_id: record.environmentId, request_id: record.requestId, key_id: record.keyId ?? null, action_id: record.actionId, outcome: record.outcome, receipt_id: record.receiptId ?? null, latency_ms: record.latencyMs, created_at: record.createdAt }) }); },
    async listRequests(scope, limit = 30) { const q = scopeQuery(scope); q.set("select", "*"); q.set("order", "created_at.desc"); q.set("limit", String(limit)); return (await rows(`vetolayer_api_requests?${q}`)).map(requestFromRow); },
  };
}

let memoryStore: DeveloperStore | null = null;

export function getDeveloperStore(): { store: DeveloperStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return { store: createSupabaseDeveloperStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey }), persistence: "supabase" };
  }
  memoryStore ??= createMemoryDeveloperStore();
  return { store: memoryStore, persistence: "memory" };
}

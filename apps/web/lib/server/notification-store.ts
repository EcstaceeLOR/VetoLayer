import { randomUUID } from "node:crypto";
import type { ProductScope } from "../workspace-model";
import { readServerEnvironment } from "./env";

export const PRODUCT_NOTIFICATION_EVENTS = [
  "review.created",
  "review.assigned",
  "review.evidence_requested",
  "review.resolved",
  "decision.blocked_high_severity",
  "integration.disconnected",
  "integration.failed",
  "policy.activated",
  "policy.deactivated",
] as const;

export type ProductNotificationEventType = (typeof PRODUCT_NOTIFICATION_EVENTS)[number];
export type NotificationSeverity = "info" | "warning" | "critical";
export type NotificationChannel = "email" | "webhook";
export type NotificationDeliveryStatus = "pending" | "processing" | "delivered" | "failed" | "dead";

export type StoredProductEvent = ProductScope & {
  id: string;
  idempotencyKey: string;
  type: ProductNotificationEventType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  href?: string;
  actorUserId?: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export type NotificationPreference = {
  workspaceId: string;
  userId: string;
  inAppEvents: ProductNotificationEventType[];
  emailEvents: ProductNotificationEventType[];
  projectIds: string[];
  updatedAt: string;
};

export type StoredNotification = ProductScope & {
  id: string;
  eventId: string;
  userId: string;
  type: ProductNotificationEventType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  href?: string;
  createdAt: string;
  readAt?: string;
};

export type StoredNotificationDelivery = ProductScope & {
  id: string;
  eventId: string;
  channel: NotificationChannel;
  destinationKey: string;
  destination: string;
  webhookEndpointId?: string;
  status: NotificationDeliveryStatus;
  attempts: number;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  deliveredAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationStore = {
  createEvent(input: Omit<StoredProductEvent, "id" | "createdAt"> & { createdAt?: string }): Promise<{ event: StoredProductEvent; created: boolean }>;
  getEvent(id: string): Promise<StoredProductEvent | null>;
  getPreference(workspaceId: string, userId: string): Promise<NotificationPreference | null>;
  savePreference(preference: NotificationPreference): Promise<void>;
  createNotification(notification: StoredNotification): Promise<void>;
  listNotifications(workspaceId: string, userId: string, limit?: number): Promise<StoredNotification[]>;
  unreadCount(workspaceId: string, userId: string): Promise<number>;
  markRead(workspaceId: string, userId: string, id: string, readAt: string): Promise<void>;
  markAllRead(workspaceId: string, userId: string, readAt: string): Promise<void>;
  enqueueDelivery(delivery: StoredNotificationDelivery): Promise<void>;
  claimDueDeliveries(limit?: number): Promise<StoredNotificationDelivery[]>;
  updateDelivery(delivery: StoredNotificationDelivery): Promise<void>;
  listDeliveries(scope: ProductScope, limit?: number): Promise<StoredNotificationDelivery[]>;
};

const events = new Map<string, StoredProductEvent>();
const eventKeys = new Map<string, string>();
const preferences = new Map<string, NotificationPreference>();
const notifications = new Map<string, StoredNotification>();
const deliveries = new Map<string, StoredNotificationDelivery>();

function prefKey(workspaceId: string, userId: string) { return `${workspaceId}:${userId}`; }
function eventKey(workspaceId: string, idempotencyKey: string) { return `${workspaceId}:${idempotencyKey}`; }
function notificationKey(eventId: string, userId: string) { return `${eventId}:${userId}`; }
function deliveryKey(eventId: string, channel: string, destinationKey: string) { return `${eventId}:${channel}:${destinationKey}`; }
function scopeMatches(record: ProductScope, scope: ProductScope) {
  return record.workspaceId === scope.workspaceId && record.projectId === scope.projectId && record.environmentId === scope.environmentId;
}

export function defaultNotificationPreference(workspaceId: string, userId: string, now = new Date().toISOString()): NotificationPreference {
  return {
    workspaceId,
    userId,
    inAppEvents: [...PRODUCT_NOTIFICATION_EVENTS],
    emailEvents: ["review.created", "review.assigned", "review.evidence_requested", "review.resolved", "decision.blocked_high_severity"],
    projectIds: [],
    updatedAt: now,
  };
}

export function createMemoryNotificationStore(): NotificationStore {
  return {
    async createEvent(input) {
      const key = eventKey(input.workspaceId, input.idempotencyKey);
      const existingId = eventKeys.get(key);
      if (existingId) return { event: events.get(existingId)!, created: false };
      const event: StoredProductEvent = { ...input, id: `evt_${randomUUID()}`, createdAt: input.createdAt ?? new Date().toISOString() };
      events.set(event.id, event);
      eventKeys.set(key, event.id);
      return { event, created: true };
    },
    async getEvent(id) { return events.get(id) ?? null; },
    async getPreference(workspaceId, userId) { return preferences.get(prefKey(workspaceId, userId)) ?? null; },
    async savePreference(preference) { preferences.set(prefKey(preference.workspaceId, preference.userId), preference); },
    async createNotification(notification) {
      const key = notificationKey(notification.eventId, notification.userId);
      if (!notifications.has(key)) notifications.set(key, notification);
    },
    async listNotifications(workspaceId, userId, limit = 50) {
      return [...notifications.values()].filter((item) => item.workspaceId === workspaceId && item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.max(1, Math.min(200, limit)));
    },
    async unreadCount(workspaceId, userId) { return [...notifications.values()].filter((item) => item.workspaceId === workspaceId && item.userId === userId && !item.readAt).length; },
    async markRead(workspaceId, userId, id, readAt) {
      const current = [...notifications.values()].find((item) => item.id === id && item.workspaceId === workspaceId && item.userId === userId);
      if (current) notifications.set(notificationKey(current.eventId, current.userId), { ...current, readAt });
    },
    async markAllRead(workspaceId, userId, readAt) {
      for (const [key, item] of notifications.entries()) if (item.workspaceId === workspaceId && item.userId === userId && !item.readAt) notifications.set(key, { ...item, readAt });
    },
    async enqueueDelivery(delivery) {
      const key = deliveryKey(delivery.eventId, delivery.channel, delivery.destinationKey);
      if (![...deliveries.values()].some((item) => deliveryKey(item.eventId, item.channel, item.destinationKey) === key)) deliveries.set(delivery.id, delivery);
    },
    async claimDueDeliveries(limit = 25) {
      const now = new Date().toISOString();
      const claimed = [...deliveries.values()].filter((item) => (item.status === "pending" || item.status === "failed") && item.nextAttemptAt <= now).sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt)).slice(0, limit);
      for (const item of claimed) deliveries.set(item.id, { ...item, status: "processing", updatedAt: now });
      return claimed.map((item) => ({ ...item, status: "processing", updatedAt: now }));
    },
    async updateDelivery(delivery) { deliveries.set(delivery.id, delivery); },
    async listDeliveries(scope, limit = 100) { return [...deliveries.values()].filter((item) => scopeMatches(item, scope)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit); },
  };
}

type Row = Record<string, unknown>;
function headers(serviceRoleKey: string) { return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" }; }

export function createSupabaseNotificationStore(config: { url: string; serviceRoleKey: string }, fetchImpl: typeof fetch = fetch): NotificationStore {
  const base = config.url.replace(/\/+$/, "");
  const authHeaders = headers(config.serviceRoleKey);
  async function request(path: string, init?: RequestInit) {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, { ...init, headers: { ...authHeaders, ...(init?.headers ?? {}) }, cache: "no-store" });
    if (!response.ok) throw new Error(`Notification persistence request failed (${response.status}).`);
    return response;
  }
  function eventFromRow(row: Row): StoredProductEvent {
    return {
      id: String(row.id), workspaceId: String(row.workspace_id), projectId: String(row.project_id), environmentId: String(row.environment_id),
      idempotencyKey: String(row.idempotency_key), type: String(row.event_type) as ProductNotificationEventType,
      severity: String(row.severity) as NotificationSeverity, title: String(row.title), message: String(row.message),
      ...(row.href ? { href: String(row.href) } : {}), ...(row.actor_user_id ? { actorUserId: String(row.actor_user_id) } : {}),
      data: row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : {}, createdAt: String(row.created_at),
    };
  }
  function preferenceFromRow(row: Row): NotificationPreference {
    return {
      workspaceId: String(row.workspace_id), userId: String(row.user_id),
      inAppEvents: Array.isArray(row.in_app_events) ? row.in_app_events.map(String) as ProductNotificationEventType[] : [],
      emailEvents: Array.isArray(row.email_events) ? row.email_events.map(String) as ProductNotificationEventType[] : [],
      projectIds: Array.isArray(row.project_ids) ? row.project_ids.map(String) : [], updatedAt: String(row.updated_at),
    };
  }
  function notificationFromRow(row: Row): StoredNotification {
    return {
      id: String(row.id), eventId: String(row.event_id), userId: String(row.user_id), workspaceId: String(row.workspace_id), projectId: String(row.project_id), environmentId: String(row.environment_id),
      type: String(row.event_type) as ProductNotificationEventType, severity: String(row.severity) as NotificationSeverity,
      title: String(row.title), message: String(row.message), ...(row.href ? { href: String(row.href) } : {}), createdAt: String(row.created_at), ...(row.read_at ? { readAt: String(row.read_at) } : {}),
    };
  }
  function deliveryFromRow(row: Row): StoredNotificationDelivery {
    return {
      id: String(row.id), eventId: String(row.event_id), workspaceId: String(row.workspace_id), projectId: String(row.project_id), environmentId: String(row.environment_id),
      channel: String(row.channel) as NotificationChannel, destinationKey: String(row.destination_key), destination: String(row.destination),
      ...(row.webhook_endpoint_id ? { webhookEndpointId: String(row.webhook_endpoint_id) } : {}), status: String(row.status) as NotificationDeliveryStatus,
      attempts: Number(row.attempts ?? 0), nextAttemptAt: String(row.next_attempt_at), ...(row.last_attempt_at ? { lastAttemptAt: String(row.last_attempt_at) } : {}),
      ...(row.delivered_at ? { deliveredAt: String(row.delivered_at) } : {}), ...(row.error ? { error: String(row.error) } : {}), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }
  return {
    async createEvent(input) {
      const event: StoredProductEvent = { ...input, id: `evt_${randomUUID()}`, createdAt: input.createdAt ?? new Date().toISOString() };
      const response = await request("vetolayer_product_events?select=*", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ id: event.id, workspace_id: event.workspaceId, project_id: event.projectId, environment_id: event.environmentId, idempotency_key: event.idempotencyKey, event_type: event.type, severity: event.severity, title: event.title, message: event.message, href: event.href ?? null, actor_user_id: event.actorUserId ?? null, data: event.data, created_at: event.createdAt }),
      });
      const inserted = await response.json() as Row[];
      if (inserted[0]) return { event: eventFromRow(inserted[0]), created: true };
      const query = new URLSearchParams({ workspace_id: `eq.${event.workspaceId}`, idempotency_key: `eq.${event.idempotencyKey}`, select: "*", limit: "1" });
      const existing = await (await request(`vetolayer_product_events?${query}`)).json() as Row[];
      if (!existing[0]) throw new Error("Idempotent product event could not be recovered.");
      return { event: eventFromRow(existing[0]), created: false };
    },
    async getEvent(id) { const rows = await (await request(`vetolayer_product_events?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)).json() as Row[]; return rows[0] ? eventFromRow(rows[0]) : null; },
    async getPreference(workspaceId, userId) {
      const q = new URLSearchParams({ workspace_id: `eq.${workspaceId}`, user_id: `eq.${userId}`, select: "*", limit: "1" });
      const rows = await (await request(`vetolayer_notification_preferences?${q}`)).json() as Row[];
      return rows[0] ? preferenceFromRow(rows[0]) : null;
    },
    async savePreference(preference) {
      await request("vetolayer_notification_preferences", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ workspace_id: preference.workspaceId, user_id: preference.userId, in_app_events: preference.inAppEvents, email_events: preference.emailEvents, project_ids: preference.projectIds, updated_at: preference.updatedAt }) });
    },
    async createNotification(notification) {
      await request("vetolayer_notifications", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ id: notification.id, event_id: notification.eventId, user_id: notification.userId, workspace_id: notification.workspaceId, project_id: notification.projectId, environment_id: notification.environmentId, event_type: notification.type, severity: notification.severity, title: notification.title, message: notification.message, href: notification.href ?? null, created_at: notification.createdAt, read_at: notification.readAt ?? null }) });
    },
    async listNotifications(workspaceId, userId, limit = 50) {
      const q = new URLSearchParams({ workspace_id: `eq.${workspaceId}`, user_id: `eq.${userId}`, select: "*", order: "created_at.desc", limit: String(Math.max(1, Math.min(200, limit))) });
      return (await (await request(`vetolayer_notifications?${q}`)).json() as Row[]).map(notificationFromRow);
    },
    async unreadCount(workspaceId, userId) {
      const q = new URLSearchParams({ workspace_id: `eq.${workspaceId}`, user_id: `eq.${userId}`, read_at: "is.null", select: "id" });
      const response = await request(`vetolayer_notifications?${q}`, { headers: { Prefer: "count=exact" } });
      const total = response.headers.get("content-range")?.split("/")[1];
      return total && total !== "*" ? Number(total) : ((await response.json() as Row[]).length);
    },
    async markRead(workspaceId, userId, id, readAt) { const q = new URLSearchParams({ id: `eq.${id}`, workspace_id: `eq.${workspaceId}`, user_id: `eq.${userId}` }); await request(`vetolayer_notifications?${q}`, { method: "PATCH", body: JSON.stringify({ read_at: readAt }) }); },
    async markAllRead(workspaceId, userId, readAt) { const q = new URLSearchParams({ workspace_id: `eq.${workspaceId}`, user_id: `eq.${userId}`, read_at: "is.null" }); await request(`vetolayer_notifications?${q}`, { method: "PATCH", body: JSON.stringify({ read_at: readAt }) }); },
    async enqueueDelivery(delivery) {
      await request("vetolayer_notification_deliveries", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ id: delivery.id, event_id: delivery.eventId, workspace_id: delivery.workspaceId, project_id: delivery.projectId, environment_id: delivery.environmentId, channel: delivery.channel, destination_key: delivery.destinationKey, destination: delivery.destination, webhook_endpoint_id: delivery.webhookEndpointId ?? null, status: delivery.status, attempts: delivery.attempts, next_attempt_at: delivery.nextAttemptAt, created_at: delivery.createdAt, updated_at: delivery.updatedAt }) });
    },
    async claimDueDeliveries(limit = 25) {
      const response = await request("rpc/vetolayer_claim_notification_deliveries", { method: "POST", body: JSON.stringify({ p_limit: Math.max(1, Math.min(100, limit)) }) });
      return (await response.json() as Row[]).map(deliveryFromRow);
    },
    async updateDelivery(delivery) {
      const q = new URLSearchParams({ id: `eq.${delivery.id}` });
      await request(`vetolayer_notification_deliveries?${q}`, { method: "PATCH", body: JSON.stringify({ status: delivery.status, attempts: delivery.attempts, next_attempt_at: delivery.nextAttemptAt, last_attempt_at: delivery.lastAttemptAt ?? null, delivered_at: delivery.deliveredAt ?? null, error: delivery.error ?? null, updated_at: delivery.updatedAt }) });
    },
    async listDeliveries(scope, limit = 100) {
      const q = new URLSearchParams({ workspace_id: `eq.${scope.workspaceId}`, project_id: `eq.${scope.projectId}`, environment_id: `eq.${scope.environmentId}`, select: "*", order: "created_at.desc", limit: String(Math.max(1, Math.min(200, limit))) });
      return (await (await request(`vetolayer_notification_deliveries?${q}`)).json() as Row[]).map(deliveryFromRow);
    },
  };
}

const memoryStore = createMemoryNotificationStore();
export function getNotificationStore(): { store: NotificationStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return { store: createSupabaseNotificationStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey }), persistence: "supabase" };
  }
  return { store: memoryStore, persistence: "memory" };
}

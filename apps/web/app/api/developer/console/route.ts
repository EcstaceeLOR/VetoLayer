import { NextResponse } from "next/server";
import { requireApiWorkspace, rejectArchivedProjectWrite } from "../../../../lib/server/api-auth";
import { recordAuditEvent, workspaceAuditInput } from "../../../../lib/server/audit";
import { parseDeveloperEvaluationPayload } from "../../../../lib/server/developer-api";
import { executeDeveloperEvaluation } from "../../../../lib/server/developer-evaluation-service";
import {
  getDeveloperStore,
  type DeveloperKeyPermission,
  type StoredDeveloperApiKey,
  type StoredDeveloperWebhook,
} from "../../../../lib/server/developer-store";
import {
  createWebhookSigningSecret,
  deliverDeveloperWebhook,
  encryptWebhookSecret,
  DEVELOPER_WEBHOOK_EVENTS,
  validateWebhookUrl,
} from "../../../../lib/server/developer-webhooks";
import type { WorkspaceContext } from "../../../../lib/server/workspace";

export const runtime = "nodejs";

const allowedPermissions = new Set<DeveloperKeyPermission>(["evaluate", "read:decisions", "webhooks"]);
const allowedEvents = new Set<string>(DEVELOPER_WEBHOOK_EVENTS);

function scopeOf(workspace: { workspaceId: string; projectId: string; environmentId: string }) {
  return { workspaceId: workspace.workspaceId, projectId: workspace.projectId, environmentId: workspace.environmentId };
}
function publicKey(record: StoredDeveloperApiKey) {
  return {
    id: record.id,
    name: record.name,
    keyPrefix: record.keyPrefix,
    permissions: record.permissions,
    status: record.status,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt ?? null,
    revokedAt: record.revokedAt ?? null,
  };
}
function publicWebhook(record: StoredDeveloperWebhook) {
  return {
    id: record.id,
    name: record.name,
    url: record.url,
    events: record.events,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastDeliveryAt: record.lastDeliveryAt ?? null,
  };
}
function productError(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}
function productionPersistenceRequired(persistence: "supabase" | "memory") {
  return process.env.NODE_ENV === "production" && persistence !== "supabase";
}

export async function GET() {
  const auth = await requireApiWorkspace("integrations.write");
  if (!auth.ok) return auth.response;
  const scope = scopeOf(auth.workspace);
  try {
    const { store, persistence } = getDeveloperStore();
    const [keys, webhooks, deliveries, requests] = await Promise.all([
      store.listApiKeys(scope),
      store.listWebhooks(scope),
      store.listWebhookDeliveries(scope, 30),
      store.listRequests(scope, 30),
    ]);
    return NextResponse.json({
      scope,
      persistence,
      keys: keys.map(publicKey),
      webhooks: webhooks.map(publicWebhook),
      deliveries,
      requests,
      webhookEvents: [...DEVELOPER_WEBHOOK_EVENTS],
    });
  } catch {
    return productError("DEVELOPER_CONSOLE_UNAVAILABLE", "Developer Console data could not be loaded. Verify product persistence is configured.", 503);
  }
}

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("integrations.write");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;
  const scope = scopeOf(auth.workspace);

  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
    body = raw as Record<string, unknown>;
  } catch {
    return productError("INVALID_REQUEST", "Request body must be valid JSON.");
  }

  const action = String(body.action ?? "");
  const { store, persistence } = getDeveloperStore();
  if (productionPersistenceRequired(persistence) && action !== "test_evaluation") {
    return productError("PERSISTENCE_REQUIRED", "Configure Supabase server persistence before managing production API credentials or webhooks.", 503);
  }

  try {
    if (action === "create_key") {
      const name = String(body.name ?? "").trim().slice(0, 80);
      const permissions = Array.isArray(body.permissions)
        ? [...new Set(body.permissions.map(String).filter((value): value is DeveloperKeyPermission => allowedPermissions.has(value as DeveloperKeyPermission)))]
        : ["evaluate" as DeveloperKeyPermission];
      if (!name || !permissions.length) return productError("INVALID_API_KEY", "Give the key a name and at least one permission.");
      const created = await store.createApiKey({ ...scope, name, permissions, createdByUserId: auth.workspace.userId });
      await auditDeveloper(auth.workspace, request, "api_key.create", "credential", "api_key", created.record.id, created.record.name, { keyPrefix: created.record.keyPrefix, permissions: created.record.permissions });
      return NextResponse.json({ key: publicKey(created.record), secret: created.secret, shownOnce: true }, { status: 201 });
    }

    if (action === "revoke_key") {
      const id = String(body.id ?? "");
      const key = id ? await store.getApiKey(scope, id) : null;
      if (!key) return productError("API_KEY_NOT_FOUND", "API key not found.", 404);
      await store.revokeApiKey(scope, id);
      await auditDeveloper(auth.workspace, request, "api_key.revoke", "credential", "api_key", key.id, key.name, { keyPrefix: key.keyPrefix, permissions: key.permissions });
      return NextResponse.json({ ok: true });
    }

    if (action === "rotate_key") {
      const id = String(body.id ?? "");
      const previous = id ? await store.getApiKey(scope, id) : null;
      if (!previous) return productError("API_KEY_NOT_FOUND", "API key not found.", 404);
      const created = await store.rotateApiKey(scope, id, auth.workspace.userId);
      await auditDeveloper(auth.workspace, request, "api_key.rotate", "credential", "api_key", created.record.id, created.record.name, { previousKeyId: previous.id, keyPrefix: created.record.keyPrefix, permissions: created.record.permissions });
      return NextResponse.json({ key: publicKey(created.record), secret: created.secret, shownOnce: true });
    }

    if (action === "create_webhook") {
      const name = String(body.name ?? "").trim().slice(0, 80);
      const validation = validateWebhookUrl(String(body.url ?? ""));
      const events = Array.isArray(body.events) ? [...new Set(body.events.map(String).filter((event) => allowedEvents.has(event)))] : [];
      if (!name || !validation.ok || !events.length) return productError("INVALID_WEBHOOK", validation.ok ? "Give the webhook a name and at least one event." : validation.message);
      const secret = createWebhookSigningSecret();
      const endpoint = await store.createWebhook({ ...scope, name, url: validation.url, events, secretCiphertext: encryptWebhookSecret(secret), createdByUserId: auth.workspace.userId });
      await auditDeveloper(auth.workspace, request, "webhook.create", "webhook", "webhook_endpoint", endpoint.id, endpoint.name, { events: endpoint.events });
      return NextResponse.json({ webhook: publicWebhook(endpoint), signingSecret: secret, shownOnce: true }, { status: 201 });
    }

    if (action === "revoke_webhook") {
      const id = String(body.id ?? "");
      const endpoint = id ? await store.getWebhook(scope, id) : null;
      if (!endpoint) return productError("WEBHOOK_NOT_FOUND", "Webhook endpoint not found.", 404);
      await store.revokeWebhook(scope, id);
      await auditDeveloper(auth.workspace, request, "webhook.revoke", "webhook", "webhook_endpoint", endpoint.id, endpoint.name, { events: endpoint.events });
      return NextResponse.json({ ok: true });
    }

    if (action === "rotate_webhook_secret") {
      const id = String(body.id ?? "");
      const endpoint = id ? await store.getWebhook(scope, id) : null;
      if (!endpoint) return productError("WEBHOOK_NOT_FOUND", "Webhook endpoint not found.", 404);
      const secret = createWebhookSigningSecret();
      await store.rotateWebhookSecret(scope, id, encryptWebhookSecret(secret));
      await auditDeveloper(auth.workspace, request, "webhook.secret.rotate", "webhook", "webhook_endpoint", endpoint.id, endpoint.name, { events: endpoint.events });
      return NextResponse.json({ signingSecret: secret, shownOnce: true });
    }

    if (action === "test_webhook") {
      const id = String(body.id ?? "");
      const endpoint = id ? await store.getWebhook(scope, id) : null;
      if (!endpoint || endpoint.status !== "active") return productError("WEBHOOK_NOT_FOUND", "Active webhook endpoint not found.", 404);
      const delivery = await deliverDeveloperWebhook({ store, endpoint, scope, eventType: "developer.webhook.test", payload: { message: "VetoLayer webhook connection test" } });
      await auditDeveloper(auth.workspace, request, "webhook.test", "webhook", "webhook_endpoint", endpoint.id, endpoint.name, { deliveryId: delivery.id, status: delivery.status });
      return NextResponse.json({ delivery });
    }

    if (action === "retry_delivery") {
      const id = String(body.id ?? "");
      const delivery = (await store.listWebhookDeliveries(scope, 100)).find((candidate) => candidate.id === id);
      if (!delivery) return productError("DELIVERY_NOT_FOUND", "Webhook delivery not found.", 404);
      const endpoint = await store.getWebhook(scope, delivery.endpointId);
      if (!endpoint || endpoint.status !== "active") return productError("WEBHOOK_NOT_FOUND", "The webhook endpoint is no longer active.", 409);
      const retried = await deliverDeveloperWebhook({ store, endpoint, scope, eventType: delivery.eventType, payload: delivery.payload, existingDelivery: delivery });
      await auditDeveloper(auth.workspace, request, "webhook.delivery.retry", "webhook", "webhook_delivery", delivery.id, endpoint.name, { endpointId: endpoint.id, eventType: delivery.eventType, attempt: retried.attempts, status: retried.status });
      return NextResponse.json({ delivery: retried });
    }

    if (action === "test_evaluation") {
      const parsed = parseDeveloperEvaluationPayload(body.payload);
      if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
      const result = await executeDeveloperEvaluation({ payload: parsed.data, scope });
      return NextResponse.json({ result });
    }

    return productError("UNKNOWN_ACTION", "Unknown Developer Console action.");
  } catch (error) {
    const code = error instanceof Error && error.name === "CredentialEncryptionNotConfigured" ? "WEBHOOK_ENCRYPTION_NOT_CONFIGURED" : "DEVELOPER_ACTION_FAILED";
    const message = code === "WEBHOOK_ENCRYPTION_NOT_CONFIGURED"
      ? "Configure VETOLAYER_CREDENTIAL_ENCRYPTION_KEY before creating production webhooks."
      : "VetoLayer could not complete that Developer Console action.";
    return productError(code, message, 503);
  }
}

async function auditDeveloper(workspace: WorkspaceContext, request: Request, action: string, category: "credential" | "webhook", targetType: string, targetId: string, targetLabel: string, metadata: Record<string, unknown>) {
  await recordAuditEvent(workspaceAuditInput(workspace, {
    action,
    category,
    targetType,
    targetId,
    targetLabel,
    href: "/dashboard/developers",
    request,
    metadata,
  }));
}

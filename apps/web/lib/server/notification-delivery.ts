import { getDeveloperStore } from "./developer-store";
import { deliverDeveloperWebhook } from "./developer-webhooks";
import { getNotificationStore, type StoredNotificationDelivery, type StoredProductEvent } from "./notification-store";
import { logServerEvent } from "./observability";

const retrySeconds = [60, 5 * 60, 30 * 60, 2 * 60 * 60, 12 * 60 * 60];
const maxAttempts = retrySeconds.length;

export async function processNotificationDeliveryBatch(input: { limit?: number } = {}) {
  const { store } = getNotificationStore();
  const claimed = await store.claimDueDeliveries(input.limit ?? 25);
  const results = await Promise.allSettled(claimed.map((delivery) => processDelivery(delivery)));
  return {
    claimed: claimed.length,
    delivered: results.filter((item) => item.status === "fulfilled" && item.value === "delivered").length,
    failed: results.filter((item) => item.status === "fulfilled" && item.value !== "delivered").length + results.filter((item) => item.status === "rejected").length,
  };
}

async function processDelivery(delivery: StoredNotificationDelivery) {
  const { store } = getNotificationStore();
  const event = await store.getEvent(delivery.eventId);
  if (!event) return finishFailure(delivery, "Product event no longer exists.", true);
  const attempt = delivery.attempts + 1;
  const now = new Date();
  try {
    if (delivery.channel === "email") await sendEmail(delivery, event);
    else await sendWebhook(delivery, event);
    const delivered: StoredNotificationDelivery = {
      ...delivery,
      status: "delivered",
      attempts: attempt,
      lastAttemptAt: now.toISOString(),
      deliveredAt: now.toISOString(),
      nextAttemptAt: now.toISOString(),
      error: undefined,
      updatedAt: now.toISOString(),
    };
    await store.updateDelivery(delivered);
    return "delivered" as const;
  } catch (error) {
    const terminal = error instanceof TerminalDeliveryError || attempt >= maxAttempts;
    return finishFailure(delivery, error instanceof Error ? error.message.slice(0, 500) : "Delivery failed.", terminal, attempt, now);
  }
}

async function finishFailure(delivery: StoredNotificationDelivery, error: string, terminal = false, attempt = delivery.attempts + 1, now = new Date()) {
  const { store } = getNotificationStore();
  const delay = retrySeconds[Math.min(Math.max(attempt - 1, 0), retrySeconds.length - 1)] ?? retrySeconds[retrySeconds.length - 1]!;
  const failed: StoredNotificationDelivery = {
    ...delivery,
    status: terminal ? "dead" : "failed",
    attempts: attempt,
    lastAttemptAt: now.toISOString(),
    nextAttemptAt: new Date(now.getTime() + delay * 1_000).toISOString(),
    error,
    updatedAt: now.toISOString(),
  };
  await store.updateDelivery(failed);
  logServerEvent("warn", "notification.delivery.failed", { deliveryId: delivery.id, eventId: delivery.eventId, channel: delivery.channel, attempts: attempt, terminal, error });
  return terminal ? "dead" as const : "failed" as const;
}

async function sendWebhook(delivery: StoredNotificationDelivery, event: StoredProductEvent) {
  if (!delivery.webhookEndpointId) throw new TerminalDeliveryError("Webhook delivery is missing its endpoint reference.");
  const scope = { workspaceId: delivery.workspaceId, projectId: delivery.projectId, environmentId: delivery.environmentId };
  const { store } = getDeveloperStore();
  const endpoint = await store.getWebhook(scope, delivery.webhookEndpointId);
  if (!endpoint || endpoint.status !== "active") throw new TerminalDeliveryError("Webhook endpoint is no longer active.");
  const result = await deliverDeveloperWebhook({
    store,
    endpoint,
    scope,
    eventId: event.id,
    eventType: event.type,
    payload: {
      eventId: event.id,
      severity: event.severity,
      title: event.title,
      message: event.message,
      href: event.href ?? null,
      ...event.data,
    },
  });
  if (result.status !== "delivered") throw new Error(result.error ?? `Webhook returned HTTP ${result.statusCode ?? "unknown"}.`);
}

async function sendEmail(delivery: StoredNotificationDelivery, event: StoredProductEvent) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.VETOLAYER_NOTIFICATION_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new TerminalDeliveryError("Email delivery is not configured. Set RESEND_API_KEY and VETOLAYER_NOTIFICATION_FROM_EMAIL.");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/+$/, "");
  const href = event.href && appUrl ? `${appUrl}${event.href.startsWith("/") ? event.href : `/${event.href}`}` : undefined;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": delivery.id,
    },
    body: JSON.stringify({
      from,
      to: [delivery.destination],
      subject: `[VetoLayer] ${event.title}`,
      text: [event.message, "", `Severity: ${event.severity.toUpperCase()}`, ...(href ? ["", `Open in VetoLayer: ${href}`] : [])].join("\n"),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
}

class TerminalDeliveryError extends Error {}

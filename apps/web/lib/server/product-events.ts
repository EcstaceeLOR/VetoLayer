import { after } from "next/server";
import { randomUUID } from "node:crypto";
import type { DecisionReceipt } from "@vetolayer/core";
import type { ProductScope, WorkspaceRole } from "../workspace-model";
import { getDeveloperStore } from "./developer-store";
import { logServerEvent } from "./observability";
import {
  defaultNotificationPreference,
  getNotificationStore,
  type NotificationSeverity,
  type ProductNotificationEventType,
  type StoredNotification,
  type StoredNotificationDelivery,
} from "./notification-store";
import { processNotificationDeliveryBatch } from "./notification-delivery";
import { getWorkspaceStore } from "./workspace-store";

export type ProductEventInput = ProductScope & {
  idempotencyKey: string;
  type: ProductNotificationEventType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  href?: string;
  actorUserId?: string;
  recipientUserIds?: string[];
  recipientRoles?: WorkspaceRole[];
  data?: Record<string, unknown>;
};

const defaultRoles: Record<ProductNotificationEventType, WorkspaceRole[]> = {
  "review.created": ["owner", "admin", "reviewer"],
  "review.assigned": ["owner", "admin", "reviewer"],
  "review.evidence_requested": ["owner", "admin", "reviewer"],
  "review.resolved": ["owner", "admin", "reviewer"],
  "decision.blocked_high_severity": ["owner", "admin", "reviewer"],
  "integration.disconnected": ["owner", "admin"],
  "integration.failed": ["owner", "admin"],
  "policy.activated": ["owner", "admin"],
  "policy.deactivated": ["owner", "admin"],
};

const webhookAliases: Partial<Record<ProductNotificationEventType, string[]>> = {
  "review.assigned": ["review.updated"],
  "review.evidence_requested": ["review.updated"],
  "policy.activated": ["policy.changed"],
  "policy.deactivated": ["policy.changed"],
  "integration.disconnected": ["integration.changed"],
  "integration.failed": ["integration.changed"],
  "decision.blocked_high_severity": ["decision.created"],
};

export async function emitProductEvent(input: ProductEventInput) {
  const { store } = getNotificationStore();
  const created = await store.createEvent({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    idempotencyKey: input.idempotencyKey,
    type: input.type,
    severity: input.severity,
    title: input.title.slice(0, 240),
    message: input.message.slice(0, 2_000),
    ...(input.href ? { href: input.href } : {}),
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    data: input.data ?? {},
  });
  if (!created.created) return created.event;

  const { store: workspaceStore } = getWorkspaceStore();
  const members = (await workspaceStore.listMembers(input.workspaceId)).filter((member) => member.status === "active");
  const explicit = input.recipientUserIds?.length ? new Set(input.recipientUserIds) : null;
  const roles = new Set(input.recipientRoles ?? defaultRoles[input.type]);
  const recipients = members.filter((member) => explicit ? explicit.has(member.userId) : roles.has(member.role));

  for (const member of recipients) {
    const preference = (await store.getPreference(input.workspaceId, member.userId)) ?? defaultNotificationPreference(input.workspaceId, member.userId);
    if (preference.projectIds.length && !preference.projectIds.includes(input.projectId)) continue;
    if (preference.inAppEvents.includes(input.type)) {
      const notification: StoredNotification = {
        id: `notification_${randomUUID()}`,
        eventId: created.event.id,
        userId: member.userId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        type: input.type,
        severity: input.severity,
        title: created.event.title,
        message: created.event.message,
        ...(created.event.href ? { href: created.event.href } : {}),
        createdAt: created.event.createdAt,
      };
      await store.createNotification(notification);
    }
    if (member.email && preference.emailEvents.includes(input.type)) {
      await enqueueDelivery({ eventId: created.event.id, scope: input, channel: "email", destinationKey: `user:${member.userId}`, destination: member.email });
    }
  }

  const { store: developerStore } = getDeveloperStore();
  const endpoints = await developerStore.listWebhooks(input);
  const acceptedTypes = new Set([input.type, ...(webhookAliases[input.type] ?? [])]);
  for (const endpoint of endpoints) {
    if (endpoint.status !== "active" || !endpoint.events.some((event) => acceptedTypes.has(event))) continue;
    await enqueueDelivery({ eventId: created.event.id, scope: input, channel: "webhook", destinationKey: `webhook:${endpoint.id}`, destination: endpoint.url, webhookEndpointId: endpoint.id });
  }

  scheduleDeliveryDrain();
  return created.event;
}

export async function emitHighSeverityBlockEvent(input: { scope: ProductScope; receipt: DecisionReceipt; source: "api" | "integration" | "review" }) {
  if (input.receipt.outcome !== "BLOCK") return null;
  const findings = [...input.receipt.deterministicFindings, ...input.receipt.contextualFindings]
    .filter((finding) => finding.status === "fail" && (finding.severity === "high" || finding.severity === "critical"));
  if (!findings.length) return null;
  const critical = findings.some((finding) => finding.severity === "critical");
  try {
    return await emitProductEvent({
      ...input.scope,
      idempotencyKey: `decision:${input.receipt.receiptId}:high-severity-block`,
      type: "decision.blocked_high_severity",
      severity: critical ? "critical" : "warning",
      title: critical ? "Critical policy blocked an action" : "High-severity policy blocked an action",
      message: `${input.receipt.action.operation} was BLOCKED: ${input.receipt.decisionSummary}`,
      href: `/dashboard/decisions/${encodeURIComponent(input.receipt.receiptId)}`,
      data: {
        receiptId: input.receipt.receiptId,
        decisionId: input.receipt.decisionId,
        actionRequestId: input.receipt.action.requestId,
        source: input.source,
        findings: findings.map((finding) => ({ policyId: finding.policyId, severity: finding.severity, summary: finding.summary })),
      },
    });
  } catch (error) {
    logServerEvent("warn", "decision.notification.emit_failed", {
      receiptId: input.receipt.receiptId,
      ...input.scope,
      source: input.source,
      message: error instanceof Error ? error.message : "High-severity BLOCK notification could not be queued",
    });
    return null;
  }
}

async function enqueueDelivery(input: { eventId: string; scope: ProductScope; channel: "email" | "webhook"; destinationKey: string; destination: string; webhookEndpointId?: string }) {
  const now = new Date().toISOString();
  const delivery: StoredNotificationDelivery = {
    id: `notify_delivery_${randomUUID()}`,
    eventId: input.eventId,
    workspaceId: input.scope.workspaceId,
    projectId: input.scope.projectId,
    environmentId: input.scope.environmentId,
    channel: input.channel,
    destinationKey: input.destinationKey,
    destination: input.destination,
    ...(input.webhookEndpointId ? { webhookEndpointId: input.webhookEndpointId } : {}),
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await getNotificationStore().store.enqueueDelivery(delivery);
}

export function scheduleDeliveryDrain() {
  try {
    after(async () => {
      try { await processNotificationDeliveryBatch({ limit: 25 }); }
      catch (error) { logServerEvent("warn", "notification.delivery.background_failed", { message: error instanceof Error ? error.message : "Background delivery failed" }); }
    });
  } catch {
    // Outside a Next request context, the durable outbox remains queued for the worker endpoint.
  }
}

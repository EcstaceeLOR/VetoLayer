import { describe, expect, it } from "vitest";
import {
  createMemoryNotificationStore,
  defaultNotificationPreference,
  type StoredNotification,
  type StoredNotificationDelivery,
} from "./notification-store";

const scope = { workspaceId: "ws_test", projectId: "prj_test", environmentId: "env_test" };

describe("notification store", () => {
  it("deduplicates product events by workspace and idempotency key", async () => {
    const store = createMemoryNotificationStore();
    const input = {
      ...scope,
      idempotencyKey: "review:123:created",
      type: "review.created" as const,
      severity: "warning" as const,
      title: "Review required",
      message: "A review needs attention.",
      data: {},
      createdAt: "2026-09-25T10:00:00.000Z",
    };

    const first = await store.createEvent(input);
    const second = await store.createEvent({ ...input, title: "Duplicate should not replace the original" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.event.id).toBe(first.event.id);
    expect(second.event.title).toBe("Review required");
  });

  it("keeps one in-product notification per event and user", async () => {
    const store = createMemoryNotificationStore();
    const notification: StoredNotification = {
      id: "notification_1",
      eventId: "evt_1",
      userId: "user_1",
      ...scope,
      type: "review.assigned",
      severity: "warning",
      title: "Review assigned",
      message: "You own this review.",
      createdAt: "2026-09-25T10:00:00.000Z",
    };

    await store.createNotification(notification);
    await store.createNotification({ ...notification, id: "notification_2", message: "Duplicate" });

    const items = await store.listNotifications(scope.workspaceId, "user_1");
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("notification_1");
    expect(items[0]?.message).toBe("You own this review.");
  });

  it("tracks unread state without crossing users", async () => {
    const store = createMemoryNotificationStore();
    const make = (id: string, eventId: string, userId: string): StoredNotification => ({
      id,
      eventId,
      userId,
      ...scope,
      type: "review.created",
      severity: "warning",
      title: "Review required",
      message: "Investigate this action.",
      createdAt: "2026-09-25T10:00:00.000Z",
    });
    await store.createNotification(make("n1", "e1", "user_1"));
    await store.createNotification(make("n2", "e2", "user_1"));
    await store.createNotification(make("n3", "e3", "user_2"));

    expect(await store.unreadCount(scope.workspaceId, "user_1")).toBe(2);
    await store.markRead(scope.workspaceId, "user_1", "n1", "2026-09-25T10:05:00.000Z");
    expect(await store.unreadCount(scope.workspaceId, "user_1")).toBe(1);
    expect(await store.unreadCount(scope.workspaceId, "user_2")).toBe(1);
    await store.markAllRead(scope.workspaceId, "user_1", "2026-09-25T10:06:00.000Z");
    expect(await store.unreadCount(scope.workspaceId, "user_1")).toBe(0);
    expect(await store.unreadCount(scope.workspaceId, "user_2")).toBe(1);
  });

  it("deduplicates delivery jobs and claims a due job only once", async () => {
    const store = createMemoryNotificationStore();
    const delivery: StoredNotificationDelivery = {
      id: "delivery_1",
      eventId: "evt_1",
      ...scope,
      channel: "webhook",
      destinationKey: "webhook:endpoint_1",
      destination: "https://example.com/hooks/vetolayer",
      webhookEndpointId: "endpoint_1",
      status: "pending",
      attempts: 0,
      nextAttemptAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    };

    await store.enqueueDelivery(delivery);
    await store.enqueueDelivery({ ...delivery, id: "delivery_duplicate" });
    expect(await store.listDeliveries(scope)).toHaveLength(1);

    const firstClaim = await store.claimDueDeliveries(10);
    const secondClaim = await store.claimDueDeliveries(10);
    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]?.status).toBe("processing");
    expect(secondClaim).toHaveLength(0);
  });

  it("defaults to all in-app events and human-workflow email alerts", () => {
    const preference = defaultNotificationPreference("ws_test", "user_1", "2026-09-25T10:00:00.000Z");
    expect(preference.inAppEvents).toContain("policy.activated");
    expect(preference.emailEvents).toContain("review.assigned");
    expect(preference.emailEvents).toContain("decision.blocked_high_severity");
    expect(preference.emailEvents).not.toContain("policy.activated");
    expect(preference.projectIds).toEqual([]);
  });
});

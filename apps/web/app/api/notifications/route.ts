import { NextResponse } from "next/server";
import { requireApiWorkspace } from "../../../lib/server/api-auth";
import {
  defaultNotificationPreference,
  getNotificationStore,
  PRODUCT_NOTIFICATION_EVENTS,
  type ProductNotificationEventType,
} from "../../../lib/server/notification-store";
import { getWorkspaceStore } from "../../../lib/server/workspace-store";

export const runtime = "nodejs";

const allowedEvents = new Set<string>(PRODUCT_NOTIFICATION_EVENTS);

export async function GET(request: Request) {
  const auth = await requireApiWorkspace("decisions.read");
  if (!auth.ok) return auth.response;
  const { store, persistence } = getNotificationStore();
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const limit = Number.isInteger(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 50;
  const preference = (await store.getPreference(auth.workspace.workspaceId, auth.workspace.userId))
    ?? defaultNotificationPreference(auth.workspace.workspaceId, auth.workspace.userId);
  const { store: workspaceStore } = getWorkspaceStore();
  const [notifications, unreadCount, projects] = await Promise.all([
    store.listNotifications(auth.workspace.workspaceId, auth.workspace.userId, limit),
    store.unreadCount(auth.workspace.workspaceId, auth.workspace.userId),
    workspaceStore.listProjects(auth.workspace.workspaceId, true),
  ]);
  return NextResponse.json({ notifications, unreadCount, preference, eventTypes: [...PRODUCT_NOTIFICATION_EVENTS], projects: projects.map(({ id, name, status }) => ({ id, name, status })), persistence });
}

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("decisions.read");
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Notification action must be valid JSON." } }, { status: 400 });
  }
  const { store } = getNotificationStore();
  const action = String(body.action ?? "");
  const now = new Date().toISOString();

  if (action === "mark_read") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: { code: "NOTIFICATION_REQUIRED", message: "Notification id is required." } }, { status: 400 });
    await store.markRead(auth.workspace.workspaceId, auth.workspace.userId, id, now);
    return NextResponse.json({ ok: true });
  }
  if (action === "mark_all_read") {
    await store.markAllRead(auth.workspace.workspaceId, auth.workspace.userId, now);
    return NextResponse.json({ ok: true });
  }
  if (action === "update_preferences") {
    const inAppEvents = parseEvents(body.inAppEvents);
    const emailEvents = parseEvents(body.emailEvents);
    if (!inAppEvents || !emailEvents) return NextResponse.json({ error: { code: "INVALID_NOTIFICATION_EVENTS", message: "Notification preferences contain an unsupported event type." } }, { status: 400 });
    const projectIds = Array.isArray(body.projectIds) ? [...new Set(body.projectIds.map(String).filter(Boolean))] : [];
    const { store: workspaceStore } = getWorkspaceStore();
    const allowedProjects = new Set((await workspaceStore.listProjects(auth.workspace.workspaceId, true)).map((project) => project.id));
    if (projectIds.some((id) => !allowedProjects.has(id))) return NextResponse.json({ error: { code: "INVALID_NOTIFICATION_PROJECT", message: "One or more notification projects do not belong to this workspace." } }, { status: 400 });
    const preference = { workspaceId: auth.workspace.workspaceId, userId: auth.workspace.userId, inAppEvents, emailEvents, projectIds, updatedAt: now };
    await store.savePreference(preference);
    return NextResponse.json({ preference });
  }
  return NextResponse.json({ error: { code: "UNKNOWN_NOTIFICATION_ACTION", message: "Use mark_read, mark_all_read, or update_preferences." } }, { status: 400 });
}

function parseEvents(value: unknown): ProductNotificationEventType[] | null {
  if (!Array.isArray(value)) return [];
  const events = [...new Set(value.map(String))];
  if (events.some((event) => !allowedEvents.has(event))) return null;
  return events as ProductNotificationEventType[];
}

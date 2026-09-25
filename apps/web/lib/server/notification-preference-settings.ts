import type { NotificationPreference } from "./notification-store";
import { getNotificationStore } from "./notification-store";
import { readServerEnvironment } from "./env";

export class NotificationPreferenceConflictError extends Error {
  constructor(public readonly current: NotificationPreference | null) {
    super("Notification preferences changed after this page was loaded.");
    this.name = "NotificationPreferenceConflictError";
  }
}

type SaveInput = {
  preference: NotificationPreference;
  expectedCurrentUpdatedAt: string | null;
};

const memoryQueues = new Map<string, Promise<void>>();

export async function saveNotificationPreferenceIfCurrent(input: SaveInput): Promise<NotificationPreference> {
  const environment = readServerEnvironment();
  const { store, persistence } = getNotificationStore();

  if (persistence === "supabase" && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return saveSupabasePreference(input, environment.supabaseUrl, environment.supabaseServiceRoleKey, store.getPreference.bind(store));
  }

  const key = `${input.preference.workspaceId}:${input.preference.userId}`;
  const previous = memoryQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  memoryQueues.set(key, previous.then(() => gate));
  await previous;
  try {
    const current = await store.getPreference(input.preference.workspaceId, input.preference.userId);
    if (!matchesExpected(current, input.expectedCurrentUpdatedAt)) throw new NotificationPreferenceConflictError(current);
    await store.savePreference(input.preference);
    return input.preference;
  } finally {
    release();
  }
}

function matchesExpected(current: NotificationPreference | null, expectedCurrentUpdatedAt: string | null) {
  if (expectedCurrentUpdatedAt === null) return current === null;
  return current?.updatedAt === expectedCurrentUpdatedAt;
}

async function saveSupabasePreference(
  input: SaveInput,
  rawUrl: string,
  serviceRoleKey: string,
  getCurrent: (workspaceId: string, userId: string) => Promise<NotificationPreference | null>,
): Promise<NotificationPreference> {
  const base = rawUrl.replace(/\/+$/, "");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const payload = {
    workspace_id: input.preference.workspaceId,
    user_id: input.preference.userId,
    in_app_events: input.preference.inAppEvents,
    email_events: input.preference.emailEvents,
    project_ids: input.preference.projectIds,
    updated_at: input.preference.updatedAt,
  };

  let response: Response;
  if (input.expectedCurrentUpdatedAt === null) {
    response = await fetch(`${base}/rest/v1/vetolayer_notification_preferences?select=*`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } else {
    const query = new URLSearchParams({
      workspace_id: `eq.${input.preference.workspaceId}`,
      user_id: `eq.${input.preference.userId}`,
      updated_at: `eq.${input.expectedCurrentUpdatedAt}`,
      select: "workspace_id",
    });
    response = await fetch(`${base}/rest/v1/vetolayer_notification_preferences?${query}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  }

  if (!response.ok) throw new Error(`Notification settings persistence failed (${response.status}).`);
  const rows = await response.json() as Array<Record<string, unknown>>;
  if (rows.length > 0) return input.preference;

  const current = await getCurrent(input.preference.workspaceId, input.preference.userId);
  throw new NotificationPreferenceConflictError(current);
}

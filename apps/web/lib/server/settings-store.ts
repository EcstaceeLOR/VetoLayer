import { readServerEnvironment } from "./env";

export const RETENTION_DAY_OPTIONS = [0, 30, 90, 180, 365, 730] as const;
export type RetentionDays = (typeof RETENTION_DAY_OPTIONS)[number];

export type WorkspaceRetentionSettings = {
  workspaceId: string;
  revision: number;
  decisionRetentionDays: RetentionDays;
  reviewRetentionDays: RetentionDays;
  notificationRetentionDays: RetentionDays;
  updatedAt: string;
  updatedByUserId?: string;
};

export type SaveWorkspaceRetentionSettings = Pick<WorkspaceRetentionSettings, "decisionRetentionDays" | "reviewRetentionDays" | "notificationRetentionDays"> & {
  expectedRevision: number;
  updatedByUserId: string;
};

export class SettingsConflictError extends Error {
  constructor(public readonly current: WorkspaceRetentionSettings) {
    super("Settings changed after this page was loaded.");
    this.name = "SettingsConflictError";
  }
}

export type WorkspaceSettingsStore = {
  get(workspaceId: string): Promise<WorkspaceRetentionSettings>;
  listConfigured(): Promise<WorkspaceRetentionSettings[]>;
  save(workspaceId: string, input: SaveWorkspaceRetentionSettings): Promise<WorkspaceRetentionSettings>;
};

const memorySettings = new Map<string, WorkspaceRetentionSettings>();

export function defaultWorkspaceRetentionSettings(workspaceId: string, now = new Date().toISOString()): WorkspaceRetentionSettings {
  return {
    workspaceId,
    revision: 0,
    decisionRetentionDays: 365,
    reviewRetentionDays: 365,
    notificationRetentionDays: 90,
    updatedAt: now,
  };
}

function validateDays(value: number): asserts value is RetentionDays {
  if (!RETENTION_DAY_OPTIONS.includes(value as RetentionDays)) throw new Error("Unsupported retention window.");
}

function validateInput(input: SaveWorkspaceRetentionSettings) {
  validateDays(input.decisionRetentionDays);
  validateDays(input.reviewRetentionDays);
  validateDays(input.notificationRetentionDays);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("expectedRevision must be a non-negative integer.");
}

export function isRetentionTightening(current: WorkspaceRetentionSettings, next: Pick<WorkspaceRetentionSettings, "decisionRetentionDays" | "reviewRetentionDays" | "notificationRetentionDays">) {
  const tighter = (before: RetentionDays, after: RetentionDays) => after !== 0 && (before === 0 || after < before);
  return tighter(current.decisionRetentionDays, next.decisionRetentionDays)
    || tighter(current.reviewRetentionDays, next.reviewRetentionDays)
    || tighter(current.notificationRetentionDays, next.notificationRetentionDays);
}

export function createMemoryWorkspaceSettingsStore(): WorkspaceSettingsStore {
  return {
    async get(workspaceId) { return memorySettings.get(workspaceId) ?? defaultWorkspaceRetentionSettings(workspaceId); },
    async listConfigured() { return [...memorySettings.values()]; },
    async save(workspaceId, input) {
      validateInput(input);
      const current = memorySettings.get(workspaceId) ?? defaultWorkspaceRetentionSettings(workspaceId);
      if (current.revision !== input.expectedRevision) throw new SettingsConflictError(current);
      const next: WorkspaceRetentionSettings = {
        workspaceId,
        revision: current.revision + 1,
        decisionRetentionDays: input.decisionRetentionDays,
        reviewRetentionDays: input.reviewRetentionDays,
        notificationRetentionDays: input.notificationRetentionDays,
        updatedAt: new Date().toISOString(),
        updatedByUserId: input.updatedByUserId,
      };
      memorySettings.set(workspaceId, next);
      return next;
    },
  };
}

type Row = Record<string, unknown>;
function headers(serviceRoleKey: string) { return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" }; }
function fromRow(row: Row): WorkspaceRetentionSettings {
  return {
    workspaceId: String(row.workspace_id),
    revision: Number(row.revision),
    decisionRetentionDays: Number(row.decision_retention_days) as RetentionDays,
    reviewRetentionDays: Number(row.review_retention_days) as RetentionDays,
    notificationRetentionDays: Number(row.notification_retention_days) as RetentionDays,
    updatedAt: String(row.updated_at),
    ...(row.updated_by_user_id ? { updatedByUserId: String(row.updated_by_user_id) } : {}),
  };
}

export function createSupabaseWorkspaceSettingsStore(config: { url: string; serviceRoleKey: string }, fetchImpl: typeof fetch = fetch): WorkspaceSettingsStore {
  const base = config.url.replace(/\/+$/, "");
  const authHeaders = headers(config.serviceRoleKey);
  async function request(path: string, init?: RequestInit) {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, { ...init, headers: { ...authHeaders, ...(init?.headers ?? {}) }, cache: "no-store" });
    if (!response.ok) throw new Error(`Settings persistence request failed (${response.status}).`);
    return response;
  }
  async function read(workspaceId: string) {
    const q = new URLSearchParams({ workspace_id: `eq.${workspaceId}`, select: "*", limit: "1" });
    const rows = await (await request(`vetolayer_workspace_settings?${q}`)).json() as Row[];
    return rows[0] ? fromRow(rows[0]) : null;
  }
  return {
    async get(workspaceId) { return await read(workspaceId) ?? defaultWorkspaceRetentionSettings(workspaceId); },
    async listConfigured() {
      const rows = await (await request("vetolayer_workspace_settings?select=*&order=workspace_id.asc")).json() as Row[];
      return rows.map(fromRow);
    },
    async save(workspaceId, input) {
      validateInput(input);
      const now = new Date().toISOString();
      if (input.expectedRevision === 0) {
        const response = await request("vetolayer_workspace_settings?select=*", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            revision: 1,
            decision_retention_days: input.decisionRetentionDays,
            review_retention_days: input.reviewRetentionDays,
            notification_retention_days: input.notificationRetentionDays,
            updated_at: now,
            updated_by_user_id: input.updatedByUserId,
          }),
        });
        const rows = await response.json() as Row[];
        if (rows[0]) return fromRow(rows[0]);
        const current = await read(workspaceId);
        if (current) throw new SettingsConflictError(current);
        throw new Error("Settings could not be created.");
      }
      const q = new URLSearchParams({ workspace_id: `eq.${workspaceId}`, revision: `eq.${input.expectedRevision}`, select: "*" });
      const response = await request(`vetolayer_workspace_settings?${q}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          revision: input.expectedRevision + 1,
          decision_retention_days: input.decisionRetentionDays,
          review_retention_days: input.reviewRetentionDays,
          notification_retention_days: input.notificationRetentionDays,
          updated_at: now,
          updated_by_user_id: input.updatedByUserId,
        }),
      });
      const rows = await response.json() as Row[];
      if (rows[0]) return fromRow(rows[0]);
      const current = await read(workspaceId) ?? defaultWorkspaceRetentionSettings(workspaceId);
      throw new SettingsConflictError(current);
    },
  };
}

const memoryStore = createMemoryWorkspaceSettingsStore();
export function getWorkspaceSettingsStore(): { store: WorkspaceSettingsStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return { store: createSupabaseWorkspaceSettingsStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey }), persistence: "supabase" };
  }
  return { store: memoryStore, persistence: "memory" };
}

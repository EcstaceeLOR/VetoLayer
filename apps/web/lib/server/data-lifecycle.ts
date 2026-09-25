import { createHash, randomUUID } from "node:crypto";
import { readServerEnvironment } from "./env";
import { getDecisionStore } from "./decision-store";
import { getPolicyLifecycleStore } from "./policy-lifecycle-store";
import { getWorkspaceSettingsStore } from "./settings-store";
import { getWorkspaceStore } from "./workspace-store";

export const DATA_LIFECYCLE_DELETE_DELAY_MS = 24 * 60 * 60 * 1000;
export const DATA_LIFECYCLE_EXPORT_SCHEMA = "vetolayer.workspace-export.2026-09";
export const DATA_LIFECYCLE_EXCLUSIONS = [
  "API key hashes and raw keys",
  "webhook signing secrets/ciphertext",
  "GitHub installation credentials",
  "invitation token hashes",
  "authentication cookies, refresh tokens, passwords and service-role credentials",
] as const;

export type DataLifecycleJobKind = "workspace_export" | "workspace_delete" | "account_delete";
export type DataLifecycleJobStatus = "queued" | "scheduled" | "running" | "completed" | "failed" | "cancelled";

export type DataLifecycleJob = {
  id: string;
  workspaceId?: string;
  requestedByUserId: string;
  kind: DataLifecycleJobKind;
  status: DataLifecycleJobStatus;
  scheduledFor?: string;
  attempts: number;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type SafeWorkspaceExport = {
  schemaVersion: typeof DATA_LIFECYCLE_EXPORT_SCHEMA;
  generatedAt: string;
  workspaceId: string;
  data: Record<string, unknown>;
  integrity: { algorithm: "sha256"; digest: string };
  excludedSecrets: readonly string[];
};

type CreateJobInput = {
  workspaceId?: string;
  requestedByUserId: string;
  kind: DataLifecycleJobKind;
  scheduledFor?: string;
  payload?: Record<string, unknown>;
};

type JobPatch = Partial<Pick<DataLifecycleJob, "status" | "scheduledFor" | "attempts" | "result" | "error" | "completedAt">>;

export type DataLifecycleStore = {
  create(input: CreateJobInput): Promise<DataLifecycleJob>;
  get(id: string): Promise<DataLifecycleJob | null>;
  listForWorkspace(workspaceId: string, limit?: number): Promise<DataLifecycleJob[]>;
  listForUser(userId: string, limit?: number): Promise<DataLifecycleJob[]>;
  listDue(limit?: number): Promise<DataLifecycleJob[]>;
  update(id: string, patch: JobPatch): Promise<DataLifecycleJob>;
};

const memoryJobs = new Map<string, DataLifecycleJob>();

function sortJobs(values: DataLifecycleJob[]) {
  return values.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createMemoryDataLifecycleStore(): DataLifecycleStore {
  return {
    async create(input) {
      const now = new Date().toISOString();
      const job: DataLifecycleJob = {
        id: `data_job_${randomUUID()}`,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        requestedByUserId: input.requestedByUserId,
        kind: input.kind,
        status: input.scheduledFor ? "scheduled" : "queued",
        ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
        attempts: 0,
        payload: input.payload ?? {},
        createdAt: now,
        updatedAt: now,
      };
      memoryJobs.set(job.id, job);
      return job;
    },
    async get(id) { return memoryJobs.get(id) ?? null; },
    async listForWorkspace(workspaceId, limit = 50) {
      return sortJobs([...memoryJobs.values()].filter((job) => job.workspaceId === workspaceId)).slice(0, Math.max(1, Math.min(200, limit)));
    },
    async listForUser(userId, limit = 50) {
      return sortJobs([...memoryJobs.values()].filter((job) => job.requestedByUserId === userId)).slice(0, Math.max(1, Math.min(200, limit)));
    },
    async listDue(limit = 20) {
      const now = Date.now();
      return [...memoryJobs.values()]
        .filter((job) => (job.status === "queued" || job.status === "scheduled" || job.status === "failed") && (!job.scheduledFor || new Date(job.scheduledFor).getTime() <= now))
        .sort((a, b) => (a.scheduledFor ?? a.createdAt).localeCompare(b.scheduledFor ?? b.createdAt))
        .slice(0, Math.max(1, Math.min(100, limit)));
    },
    async update(id, patch) {
      const current = memoryJobs.get(id);
      if (!current) throw new Error("Data lifecycle job not found.");
      const next: DataLifecycleJob = {
        ...current,
        ...patch,
        ...(patch.error === undefined ? {} : patch.error ? { error: patch.error } : { error: undefined }),
        updatedAt: new Date().toISOString(),
      };
      if (!next.error) delete next.error;
      memoryJobs.set(id, next);
      return next;
    },
  };
}

type Row = Record<string, unknown>;
function fromRow(row: Row): DataLifecycleJob {
  return {
    id: String(row.id),
    ...(row.workspace_id ? { workspaceId: String(row.workspace_id) } : {}),
    requestedByUserId: String(row.requested_by_user_id),
    kind: row.kind as DataLifecycleJobKind,
    status: row.status as DataLifecycleJobStatus,
    ...(row.scheduled_for ? { scheduledFor: String(row.scheduled_for) } : {}),
    attempts: Number(row.attempts ?? 0),
    payload: (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>,
    ...(row.result && typeof row.result === "object" ? { result: row.result as Record<string, unknown> } : {}),
    ...(row.error ? { error: String(row.error) } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(row.completed_at ? { completedAt: String(row.completed_at) } : {}),
  };
}

function supabaseConfig() {
  const env = readServerEnvironment();
  if (!env.persistenceConfigured || !env.supabaseUrl || !env.supabaseServiceRoleKey) return null;
  return { base: env.supabaseUrl.replace(/\/+$/, ""), key: env.supabaseServiceRoleKey };
}

async function supabaseRequest(path: string, init?: RequestInit) {
  const config = supabaseConfig();
  if (!config) throw new Error("Durable persistence is not configured.");
  const response = await fetch(`${config.base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Data lifecycle persistence failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }
  return response;
}

export function createSupabaseDataLifecycleStore(): DataLifecycleStore {
  const select = "id,workspace_id,requested_by_user_id,kind,status,scheduled_for,attempts,payload,result,error,created_at,updated_at,completed_at";
  return {
    async create(input) {
      const now = new Date().toISOString();
      const response = await supabaseRequest("vetolayer_data_lifecycle_jobs?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          id: `data_job_${randomUUID()}`,
          workspace_id: input.workspaceId ?? null,
          requested_by_user_id: input.requestedByUserId,
          kind: input.kind,
          status: input.scheduledFor ? "scheduled" : "queued",
          scheduled_for: input.scheduledFor ?? null,
          attempts: 0,
          payload: input.payload ?? {},
          created_at: now,
          updated_at: now,
        }),
      });
      const rows = await response.json() as Row[];
      if (!rows[0]) throw new Error("Data lifecycle job could not be created.");
      return fromRow(rows[0]);
    },
    async get(id) {
      const query = new URLSearchParams({ select, id: `eq.${id}`, limit: "1" });
      const rows = await (await supabaseRequest(`vetolayer_data_lifecycle_jobs?${query}`)).json() as Row[];
      return rows[0] ? fromRow(rows[0]) : null;
    },
    async listForWorkspace(workspaceId, limit = 50) {
      const query = new URLSearchParams({ select, workspace_id: `eq.${workspaceId}`, order: "created_at.desc,id.desc", limit: String(Math.max(1, Math.min(200, limit))) });
      return (await (await supabaseRequest(`vetolayer_data_lifecycle_jobs?${query}`)).json() as Row[]).map(fromRow);
    },
    async listForUser(userId, limit = 50) {
      const query = new URLSearchParams({ select, requested_by_user_id: `eq.${userId}`, order: "created_at.desc,id.desc", limit: String(Math.max(1, Math.min(200, limit))) });
      return (await (await supabaseRequest(`vetolayer_data_lifecycle_jobs?${query}`)).json() as Row[]).map(fromRow);
    },
    async listDue(limit = 20) {
      const now = new Date().toISOString();
      const query = new URLSearchParams({
        select,
        status: "in.(queued,scheduled,failed)",
        or: `(scheduled_for.is.null,scheduled_for.lte.${now})`,
        order: "scheduled_for.asc.nullsfirst,created_at.asc",
        limit: String(Math.max(1, Math.min(100, limit))),
      });
      return (await (await supabaseRequest(`vetolayer_data_lifecycle_jobs?${query}`)).json() as Row[]).map(fromRow);
    },
    async update(id, patch) {
      const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.status !== undefined) body.status = patch.status;
      if (patch.scheduledFor !== undefined) body.scheduled_for = patch.scheduledFor ?? null;
      if (patch.attempts !== undefined) body.attempts = patch.attempts;
      if (patch.result !== undefined) body.result = patch.result;
      if (patch.error !== undefined) body.error = patch.error || null;
      if (patch.completedAt !== undefined) body.completed_at = patch.completedAt ?? null;
      const query = new URLSearchParams({ id: `eq.${id}`, select: "*" });
      const response = await supabaseRequest(`vetolayer_data_lifecycle_jobs?${query}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      const rows = await response.json() as Row[];
      if (!rows[0]) throw new Error("Data lifecycle job could not be updated.");
      return fromRow(rows[0]);
    },
  };
}

const memoryStore = createMemoryDataLifecycleStore();
export function getDataLifecycleStore(): { store: DataLifecycleStore; persistence: "supabase" | "memory" } {
  return supabaseConfig() ? { store: createSupabaseDataLifecycleStore(), persistence: "supabase" } : { store: memoryStore, persistence: "memory" };
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await supabaseRequest(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  return await response.json() as T;
}

async function memoryWorkspaceSnapshot(workspaceId: string) {
  const { store: workspaceStore } = getWorkspaceStore();
  const workspace = await workspaceStore.getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");
  const projects = await workspaceStore.listProjects(workspaceId, true);
  const environments = (await Promise.all(projects.map((project) => workspaceStore.listEnvironments(workspaceId, project.id, true)))).flat();
  const members = await workspaceStore.listMembers(workspaceId);
  const { store: policyStore } = getPolicyLifecycleStore();
  const policies = (await Promise.all(projects.map((project) => policyStore.listProjectVersions({ workspaceId, projectId: project.id })))).flat();
  const { store: decisionStore } = getDecisionStore();
  const decisions = [];
  let page = 1;
  while (page <= 100) {
    const batch = await decisionStore.query(workspaceId, { page, pageSize: 100, sort: "newest" });
    decisions.push(...batch.decisions);
    if (!batch.hasNext) break;
    page += 1;
  }
  const retention = await getWorkspaceSettingsStore().store.get(workspaceId);
  return {
    workspace,
    projects,
    environments,
    members,
    policies,
    decisions,
    reviews: [],
    auditEvents: [],
    retention,
    plan: null,
    inventory: {
      projects: projects.length,
      environments: environments.length,
      members: members.length,
      policyVersions: policies.length,
      decisions: decisions.length,
      reviews: 0,
      auditEvents: 0,
    },
    excludedSecrets: [...DATA_LIFECYCLE_EXCLUSIONS],
    developmentNote: "Memory-mode exports do not represent durable production storage. Production exports use the complete Supabase snapshot RPC.",
  };
}

export async function buildSafeWorkspaceExport(workspaceId: string): Promise<SafeWorkspaceExport> {
  const data = supabaseConfig()
    ? await rpc<Record<string, unknown>>("vetolayer_safe_workspace_export", { p_workspace_id: workspaceId })
    : await memoryWorkspaceSnapshot(workspaceId);
  const base = {
    schemaVersion: DATA_LIFECYCLE_EXPORT_SCHEMA,
    generatedAt: new Date().toISOString(),
    workspaceId,
    data,
  } as const;
  const digest = createHash("sha256").update(JSON.stringify(base)).digest("hex");
  return { ...base, integrity: { algorithm: "sha256", digest }, excludedSecrets: [...DATA_LIFECYCLE_EXCLUSIONS] };
}

export async function transferWorkspaceOwnership(workspaceId: string, currentOwnerUserId: string, newOwnerUserId: string) {
  if (supabaseConfig()) {
    await rpc("vetolayer_transfer_workspace_ownership", {
      p_workspace_id: workspaceId,
      p_current_owner: currentOwnerUserId,
      p_new_owner: newOwnerUserId,
    });
    return;
  }
  const { store } = getWorkspaceStore();
  const current = await store.getMembership(workspaceId, currentOwnerUserId);
  const next = await store.getMembership(workspaceId, newOwnerUserId);
  if (current?.role !== "owner" || !next) throw new Error("Ownership transfer requires the current owner and an active workspace member.");
  await store.updateMemberRole(workspaceId, currentOwnerUserId, "admin");
  await store.updateMemberRole(workspaceId, newOwnerUserId, "owner");
}

async function permanentlyDeleteWorkspace(workspaceId: string, ownerUserId: string) {
  if (!supabaseConfig()) {
    await getWorkspaceStore().store.archiveWorkspace(workspaceId);
    return { workspaceId, deleted: false, developmentMemoryArchived: true, retainedAppendOnlyAuditEvents: 0 };
  }
  return await rpc<Record<string, unknown>>("vetolayer_permanently_delete_workspace", {
    p_workspace_id: workspaceId,
    p_owner_user_id: ownerUserId,
  });
}

async function offboardAccount(userId: string) {
  const config = supabaseConfig();
  if (!config) throw new Error("Account deletion requires durable Supabase persistence.");
  const cleanup = await rpc<Record<string, unknown>>("vetolayer_offboard_account", { p_user_id: userId });
  const response = await fetch(`${config.base}/auth/v1/admin/users/${encodeURIComponent(userId)}?should_soft_delete=true`, {
    method: "DELETE",
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Account identity deletion failed (${response.status}).`);
  return { ...cleanup, identitySoftDeleted: true };
}

export async function processDataLifecycleJob(jobId: string) {
  const { store } = getDataLifecycleStore();
  const job = await store.get(jobId);
  if (!job) throw new Error("Data lifecycle job not found.");
  if (job.status === "completed" || job.status === "cancelled" || job.status === "running") return job;
  if (job.scheduledFor && new Date(job.scheduledFor).getTime() > Date.now()) return job;

  const running = await store.update(job.id, { status: "running", attempts: job.attempts + 1, error: "" });
  try {
    if (running.kind === "workspace_export") {
      if (!running.workspaceId) throw new Error("Workspace export job has no workspace.");
      const exportBundle = await buildSafeWorkspaceExport(running.workspaceId);
      return await store.update(running.id, {
        status: "completed",
        result: { export: exportBundle },
        completedAt: new Date().toISOString(),
        error: "",
      });
    }

    if (running.kind === "workspace_delete") {
      if (!running.workspaceId) throw new Error("Workspace deletion job has no workspace.");
      const exportBundle = await buildSafeWorkspaceExport(running.workspaceId);
      const ownerUserId = String(running.payload.ownerUserId ?? running.requestedByUserId);
      const deletion = await permanentlyDeleteWorkspace(running.workspaceId, ownerUserId);
      return await store.update(running.id, {
        status: "completed",
        result: { export: exportBundle, deletion },
        completedAt: new Date().toISOString(),
        error: "",
      });
    }

    const deletion = await offboardAccount(running.requestedByUserId);
    return await store.update(running.id, {
      status: "completed",
      result: { accountDeletion: deletion },
      completedAt: new Date().toISOString(),
      error: "",
    });
  } catch (error) {
    return await store.update(running.id, {
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 1000) : "Data lifecycle job failed.",
    });
  }
}

export async function processDueDataLifecycleJobs(limit = 20) {
  const { store } = getDataLifecycleStore();
  const due = await store.listDue(limit);
  const results: DataLifecycleJob[] = [];
  for (const job of due) results.push(await processDataLifecycleJob(job.id));
  return results;
}

export function deletionSchedule(from = Date.now()) {
  return new Date(from + DATA_LIFECYCLE_DELETE_DELAY_MS).toISOString();
}

export function isActiveDeletionJob(job: DataLifecycleJob) {
  return (job.kind === "workspace_delete" || job.kind === "account_delete") && ["queued", "scheduled", "running"].includes(job.status);
}

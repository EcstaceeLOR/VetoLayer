import { randomUUID } from "node:crypto";
import { PolicySchema, type Policy } from "@vetolayer/core";
import type { PolicyVersionRecord } from "../policy-lifecycle";
import { readServerEnvironment } from "./env";

export type PolicyProjectScope = { workspaceId: string; projectId: string };
export type PolicyEnvironmentScope = PolicyProjectScope & { environmentId: string };

export type PolicyLifecycleStore = {
  listProjectVersions(scope: PolicyProjectScope): Promise<PolicyVersionRecord[]>;
  listActiveForEnvironment(scope: PolicyEnvironmentScope): Promise<PolicyVersionRecord[]>;
  getVersion(scope: PolicyProjectScope, versionId: string): Promise<PolicyVersionRecord | null>;
  createInitialDraft(input: PolicyProjectScope & {
    policy: Policy;
    targetEnvironmentIds: string[];
    sourceTemplateId?: string;
    changeNote?: string;
    createdByUserId: string;
  }): Promise<PolicyVersionRecord>;
  updateDraft(input: PolicyProjectScope & {
    versionId: string;
    policy: Policy;
    targetEnvironmentIds: string[];
    changeNote?: string;
  }): Promise<PolicyVersionRecord>;
  forkDraft(input: PolicyProjectScope & {
    sourceVersionId: string;
    createdByUserId: string;
    changeNote?: string;
  }): Promise<PolicyVersionRecord>;
  duplicateVersion(input: PolicyProjectScope & {
    sourceVersionId: string;
    createdByUserId: string;
  }): Promise<PolicyVersionRecord>;
  activateVersion(scope: PolicyProjectScope, versionId: string, now?: string): Promise<PolicyVersionRecord>;
  archiveVersion(scope: PolicyProjectScope, versionId: string, now?: string): Promise<PolicyVersionRecord>;
};

const memoryVersions = new Map<string, PolicyVersionRecord>();

function normalizeTargets(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function draftPolicy(policy: Policy, policyId: string): Policy {
  return PolicySchema.parse({ ...policy, id: policyId, enabled: false });
}

function activePolicy(policy: Policy, policyId: string): Policy {
  return PolicySchema.parse({ ...policy, id: policyId, enabled: true });
}

function scopeMatches(record: PolicyVersionRecord, scope: PolicyProjectScope) {
  return record.workspaceId === scope.workspaceId && record.projectId === scope.projectId;
}

export function createMemoryPolicyLifecycleStore(): PolicyLifecycleStore {
  return {
    async listProjectVersions(scope) {
      return [...memoryVersions.values()]
        .filter((record) => scopeMatches(record, scope))
        .sort((a, b) => a.policyId === b.policyId ? b.version - a.version : a.policyId.localeCompare(b.policyId));
    },
    async listActiveForEnvironment(scope) {
      return [...memoryVersions.values()]
        .filter((record) => scopeMatches(record, scope) && record.state === "active" && record.targetEnvironmentIds.includes(scope.environmentId))
        .sort((a, b) => a.policy.priority - b.policy.priority || a.policy.name.localeCompare(b.policy.name));
    },
    async getVersion(scope, versionId) {
      const record = memoryVersions.get(versionId);
      return record && scopeMatches(record, scope) ? record : null;
    },
    async createInitialDraft(input) {
      const now = new Date().toISOString();
      const policyId = `policy_${randomUUID()}`;
      const record: PolicyVersionRecord = {
        id: `pv_${randomUUID()}`,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        policyId,
        version: 1,
        state: "draft",
        policy: draftPolicy(input.policy, policyId),
        targetEnvironmentIds: normalizeTargets(input.targetEnvironmentIds),
        ...(input.sourceTemplateId ? { sourceTemplateId: input.sourceTemplateId } : {}),
        ...(input.changeNote?.trim() ? { changeNote: input.changeNote.trim() } : {}),
        createdByUserId: input.createdByUserId,
        createdAt: now,
        updatedAt: now,
      };
      memoryVersions.set(record.id, record);
      return record;
    },
    async updateDraft(input) {
      const current = memoryVersions.get(input.versionId);
      if (!current || !scopeMatches(current, input)) throw new Error("Policy version not found.");
      if (current.state !== "draft") throw new Error("Published policy versions are immutable. Create a new draft version instead.");
      const updated: PolicyVersionRecord = {
        ...current,
        policy: draftPolicy(input.policy, current.policyId),
        targetEnvironmentIds: normalizeTargets(input.targetEnvironmentIds),
        ...(input.changeNote?.trim() ? { changeNote: input.changeNote.trim() } : { changeNote: undefined }),
        updatedAt: new Date().toISOString(),
      };
      memoryVersions.set(updated.id, updated);
      return updated;
    },
    async forkDraft(input) {
      const source = memoryVersions.get(input.sourceVersionId);
      if (!source || !scopeMatches(source, input)) throw new Error("Policy version not found.");
      const siblings = [...memoryVersions.values()].filter((record) => scopeMatches(record, input) && record.policyId === source.policyId);
      if (siblings.some((record) => record.state === "draft")) throw new Error("This policy already has an editable draft version.");
      const now = new Date().toISOString();
      const record: PolicyVersionRecord = {
        ...source,
        id: `pv_${randomUUID()}`,
        version: Math.max(...siblings.map((record) => record.version), 0) + 1,
        state: "draft",
        policy: draftPolicy(source.policy, source.policyId),
        basedOnVersionId: source.id,
        ...(input.changeNote?.trim() ? { changeNote: input.changeNote.trim() } : { changeNote: undefined }),
        createdByUserId: input.createdByUserId,
        createdAt: now,
        updatedAt: now,
        publishedAt: undefined,
        archivedAt: undefined,
      };
      memoryVersions.set(record.id, record);
      return record;
    },
    async duplicateVersion(input) {
      const source = memoryVersions.get(input.sourceVersionId);
      if (!source || !scopeMatches(source, input)) throw new Error("Policy version not found.");
      return this.createInitialDraft({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        policy: { ...source.policy, name: `${source.policy.name} copy`, enabled: false },
        targetEnvironmentIds: source.targetEnvironmentIds,
        ...(source.sourceTemplateId ? { sourceTemplateId: source.sourceTemplateId } : {}),
        changeNote: `Duplicated from ${source.policy.name} v${source.version}`,
        createdByUserId: input.createdByUserId,
      });
    },
    async activateVersion(scope, versionId, now = new Date().toISOString()) {
      const candidate = memoryVersions.get(versionId);
      if (!candidate || !scopeMatches(candidate, scope)) throw new Error("Policy version not found.");
      if (candidate.state === "active") return candidate;
      for (const [id, sibling] of memoryVersions.entries()) {
        if (!scopeMatches(sibling, scope) || sibling.policyId !== candidate.policyId || sibling.state !== "active") continue;
        memoryVersions.set(id, { ...sibling, state: "archived", policy: draftPolicy(sibling.policy, sibling.policyId), archivedAt: now, updatedAt: now });
      }
      const activated: PolicyVersionRecord = {
        ...candidate,
        state: "active",
        policy: activePolicy(candidate.policy, candidate.policyId),
        publishedAt: candidate.publishedAt ?? now,
        archivedAt: undefined,
        updatedAt: now,
      };
      memoryVersions.set(versionId, activated);
      return activated;
    },
    async archiveVersion(scope, versionId, now = new Date().toISOString()) {
      const current = memoryVersions.get(versionId);
      if (!current || !scopeMatches(current, scope)) throw new Error("Policy version not found.");
      if (current.state === "archived") return current;
      const archived: PolicyVersionRecord = {
        ...current,
        state: "archived",
        policy: draftPolicy(current.policy, current.policyId),
        archivedAt: now,
        updatedAt: now,
      };
      memoryVersions.set(versionId, archived);
      return archived;
    },
  };
}

type Row = Record<string, unknown>;

function rowToVersion(row: Row): PolicyVersionRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id),
    policyId: String(row.policy_id),
    version: Number(row.version),
    state: String(row.state) as PolicyVersionRecord["state"],
    policy: PolicySchema.parse(row.policy),
    targetEnvironmentIds: Array.isArray(row.target_environment_ids) ? row.target_environment_ids.map(String) : [],
    ...(row.source_template_id ? { sourceTemplateId: String(row.source_template_id) } : {}),
    ...(row.based_on_version_id ? { basedOnVersionId: String(row.based_on_version_id) } : {}),
    ...(row.change_note ? { changeNote: String(row.change_note) } : {}),
    createdByUserId: String(row.created_by_user_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(row.published_at ? { publishedAt: String(row.published_at) } : {}),
    ...(row.archived_at ? { archivedAt: String(row.archived_at) } : {}),
  };
}

export function createSupabasePolicyLifecycleStore(
  config: { url: string; serviceRoleKey: string },
  fetchImpl: typeof fetch = fetch,
): PolicyLifecycleStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" };

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (response.ok) return response;
    const body = await response.text().catch(() => "");
    throw new Error(`Policy lifecycle persistence failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  async function rows(path: string) {
    return await (await request(path)).json() as Row[];
  }

  async function fetchVersion(scope: PolicyProjectScope, versionId: string) {
    const query = new URLSearchParams({
      id: `eq.${versionId}`,
      workspace_id: `eq.${scope.workspaceId}`,
      project_id: `eq.${scope.projectId}`,
      select: "*",
      limit: "1",
    });
    const found = await rows(`vetolayer_policy_versions?${query}`);
    return found[0] ? rowToVersion(found[0]) : null;
  }

  const store: PolicyLifecycleStore = {
    async listProjectVersions(scope) {
      const query = new URLSearchParams({ workspace_id: `eq.${scope.workspaceId}`, project_id: `eq.${scope.projectId}`, select: "*", order: "policy_id.asc,version.desc" });
      return (await rows(`vetolayer_policy_versions?${query}`)).map(rowToVersion);
    },
    async listActiveForEnvironment(scope) {
      const query = new URLSearchParams({ workspace_id: `eq.${scope.workspaceId}`, project_id: `eq.${scope.projectId}`, state: "eq.active", select: "*", order: "version.desc" });
      return (await rows(`vetolayer_policy_versions?${query}`))
        .map(rowToVersion)
        .filter((record) => record.targetEnvironmentIds.includes(scope.environmentId))
        .sort((a, b) => a.policy.priority - b.policy.priority || a.policy.name.localeCompare(b.policy.name));
    },
    async getVersion(scope, versionId) { return fetchVersion(scope, versionId); },
    async createInitialDraft(input) {
      const now = new Date().toISOString();
      const policyId = `policy_${randomUUID()}`;
      const record: PolicyVersionRecord = {
        id: `pv_${randomUUID()}`,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        policyId,
        version: 1,
        state: "draft",
        policy: draftPolicy(input.policy, policyId),
        targetEnvironmentIds: normalizeTargets(input.targetEnvironmentIds),
        ...(input.sourceTemplateId ? { sourceTemplateId: input.sourceTemplateId } : {}),
        ...(input.changeNote?.trim() ? { changeNote: input.changeNote.trim() } : {}),
        createdByUserId: input.createdByUserId,
        createdAt: now,
        updatedAt: now,
      };
      await request("vetolayer_policy_versions", {
        method: "POST",
        body: JSON.stringify({
          id: record.id, workspace_id: record.workspaceId, project_id: record.projectId, policy_id: record.policyId,
          version: record.version, state: record.state, policy: record.policy, target_environment_ids: record.targetEnvironmentIds,
          source_template_id: record.sourceTemplateId ?? null, based_on_version_id: null, change_note: record.changeNote ?? null,
          created_by_user_id: record.createdByUserId, created_at: record.createdAt, updated_at: record.updatedAt,
        }),
      });
      return record;
    },
    async updateDraft(input) {
      const current = await fetchVersion(input, input.versionId);
      if (!current) throw new Error("Policy version not found.");
      if (current.state !== "draft") throw new Error("Published policy versions are immutable. Create a new draft version instead.");
      const updatedAt = new Date().toISOString();
      const query = new URLSearchParams({ id: `eq.${input.versionId}`, workspace_id: `eq.${input.workspaceId}`, project_id: `eq.${input.projectId}`, state: "eq.draft", select: "*" });
      const response = await request(`vetolayer_policy_versions?${query}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ policy: draftPolicy(input.policy, current.policyId), target_environment_ids: normalizeTargets(input.targetEnvironmentIds), change_note: input.changeNote?.trim() || null, updated_at: updatedAt }),
      });
      const updated = await response.json() as Row[];
      if (!updated[0]) throw new Error("Draft changed before it could be saved.");
      return rowToVersion(updated[0]);
    },
    async forkDraft(input) {
      const newVersionId = `pv_${randomUUID()}`;
      await request("rpc/vetolayer_fork_policy_version", {
        method: "POST",
        body: JSON.stringify({ p_source_version_id: input.sourceVersionId, p_new_version_id: newVersionId, p_created_by_user_id: input.createdByUserId, p_change_note: input.changeNote?.trim() || null }),
      });
      const created = await fetchVersion(input, newVersionId);
      if (!created) throw new Error("New policy draft could not be loaded.");
      return created;
    },
    async duplicateVersion(input) {
      const source = await fetchVersion(input, input.sourceVersionId);
      if (!source) throw new Error("Policy version not found.");
      return store.createInitialDraft({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        policy: { ...source.policy, name: `${source.policy.name} copy`, enabled: false },
        targetEnvironmentIds: source.targetEnvironmentIds,
        ...(source.sourceTemplateId ? { sourceTemplateId: source.sourceTemplateId } : {}),
        changeNote: `Duplicated from ${source.policy.name} v${source.version}`,
        createdByUserId: input.createdByUserId,
      });
    },
    async activateVersion(scope, versionId) {
      await request("rpc/vetolayer_activate_policy_version", { method: "POST", body: JSON.stringify({ p_version_id: versionId }) });
      const activated = await fetchVersion(scope, versionId);
      if (!activated || activated.state !== "active") throw new Error("Policy version could not be activated.");
      return activated;
    },
    async archiveVersion(scope, versionId, now = new Date().toISOString()) {
      const current = await fetchVersion(scope, versionId);
      if (!current) throw new Error("Policy version not found.");
      if (current.state === "archived") return current;
      const query = new URLSearchParams({ id: `eq.${versionId}`, workspace_id: `eq.${scope.workspaceId}`, project_id: `eq.${scope.projectId}`, select: "*" });
      const response = await request(`vetolayer_policy_versions?${query}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ state: "archived", policy: draftPolicy(current.policy, current.policyId), archived_at: now, updated_at: now }),
      });
      const updated = await response.json() as Row[];
      if (!updated[0]) throw new Error("Policy version could not be archived.");
      return rowToVersion(updated[0]);
    },
  };

  return store;
}

const memoryStore = createMemoryPolicyLifecycleStore();

export function getPolicyLifecycleStore(): { store: PolicyLifecycleStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return { store: createSupabasePolicyLifecycleStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey }), persistence: "supabase" };
  }
  return { store: memoryStore, persistence: "memory" };
}

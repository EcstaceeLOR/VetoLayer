import type { OnboardingSession, OnboardingSkippableStep, OnboardingUseCase } from "../onboarding";
import type { IntegrationKey } from "../integration-contracts";
import { readServerEnvironment } from "./env";

export type OnboardingSessionPatch = Partial<Omit<OnboardingSession, "userId" | "updatedAt">>;

export type OnboardingStore = {
  get(userId: string): Promise<OnboardingSession | null>;
  save(userId: string, patch: OnboardingSessionPatch): Promise<OnboardingSession>;
  reset(userId: string, preserved?: Pick<OnboardingSession, "workspaceId" | "projectId" | "environmentId">): Promise<OnboardingSession>;
};

const memory = new Map<string, OnboardingSession>();

function emptySession(userId: string, preserved?: Pick<OnboardingSession, "workspaceId" | "projectId" | "environmentId">): OnboardingSession {
  return {
    userId,
    ...(preserved?.workspaceId ? { workspaceId: preserved.workspaceId } : {}),
    ...(preserved?.projectId ? { projectId: preserved.projectId } : {}),
    ...(preserved?.environmentId ? { environmentId: preserved.environmentId } : {}),
    policyIds: [],
    skippedSteps: [],
    updatedAt: new Date().toISOString(),
  };
}

function mergeSession(current: OnboardingSession, patch: OnboardingSessionPatch): OnboardingSession {
  return { ...current, ...patch, userId: current.userId, updatedAt: new Date().toISOString() };
}

export function createMemoryOnboardingStore(): OnboardingStore {
  return {
    async get(userId) { return memory.get(userId) ?? null; },
    async save(userId, patch) {
      const current = memory.get(userId) ?? emptySession(userId);
      const next = mergeSession(current, patch);
      memory.set(userId, next);
      return next;
    },
    async reset(userId, preserved) {
      const next = emptySession(userId, preserved);
      memory.set(userId, next);
      return next;
    },
  };
}

export function createSupabaseOnboardingStore(
  config: { url: string; serviceRoleKey: string },
  fetchImpl: typeof fetch = fetch,
): OnboardingStore {
  const baseUrl = config.url.replace(/\/+$/, "");
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  async function requireSuccess(response: Response, operation: string) {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    throw new Error(`Onboarding persistence ${operation} failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  function mapRow(row: {
    user_id: string;
    workspace_id?: string | null;
    project_id?: string | null;
    environment_id?: string | null;
    draft_workspace_name?: string | null;
    draft_project_name?: string | null;
    use_case?: OnboardingUseCase | null;
    integration?: IntegrationKey | null;
    policy_ids?: unknown;
    first_receipt_id?: string | null;
    skipped_steps?: unknown;
    completed_at?: string | null;
    updated_at: string;
  }): OnboardingSession {
    const policyIds = Array.isArray(row.policy_ids) ? row.policy_ids.filter((value): value is string => typeof value === "string") : [];
    const skippedSteps = Array.isArray(row.skipped_steps)
      ? row.skipped_steps.filter((value): value is OnboardingSkippableStep => value === "integration" || value === "policy" || value === "serv")
      : [];
    return {
      userId: row.user_id,
      ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
      ...(row.project_id ? { projectId: row.project_id } : {}),
      ...(row.environment_id ? { environmentId: row.environment_id } : {}),
      ...(row.draft_workspace_name ? { draftWorkspaceName: row.draft_workspace_name } : {}),
      ...(row.draft_project_name ? { draftProjectName: row.draft_project_name } : {}),
      ...(row.use_case ? { useCase: row.use_case } : {}),
      ...(row.integration ? { integration: row.integration } : {}),
      policyIds,
      ...(row.first_receipt_id ? { firstReceiptId: row.first_receipt_id } : {}),
      skippedSteps,
      ...(row.completed_at ? { completedAt: row.completed_at } : {}),
      updatedAt: row.updated_at,
    };
  }

  async function get(userId: string) {
    const query = new URLSearchParams({
      select: "user_id,workspace_id,project_id,environment_id,draft_workspace_name,draft_project_name,use_case,integration,policy_ids,first_receipt_id,skipped_steps,completed_at,updated_at",
      user_id: `eq.${userId}`,
      limit: "1",
    });
    const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_onboarding_sessions?${query}`, { headers });
    await requireSuccess(response, "get");
    const rows = await response.json() as Array<Parameters<typeof mapRow>[0]>;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async function persist(session: OnboardingSession) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_onboarding_sessions`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        user_id: session.userId,
        workspace_id: session.workspaceId ?? null,
        project_id: session.projectId ?? null,
        environment_id: session.environmentId ?? null,
        draft_workspace_name: session.draftWorkspaceName ?? null,
        draft_project_name: session.draftProjectName ?? null,
        use_case: session.useCase ?? null,
        integration: session.integration ?? null,
        policy_ids: session.policyIds,
        first_receipt_id: session.firstReceiptId ?? null,
        skipped_steps: session.skippedSteps,
        completed_at: session.completedAt ?? null,
        updated_at: session.updatedAt,
      }),
    });
    await requireSuccess(response, "save");
    const rows = await response.json() as Array<Parameters<typeof mapRow>[0]>;
    return rows[0] ? mapRow(rows[0]) : session;
  }

  return {
    get,
    async save(userId, patch) {
      const current = await get(userId) ?? emptySession(userId);
      return persist(mergeSession(current, patch));
    },
    async reset(userId, preserved) {
      return persist(emptySession(userId, preserved));
    },
  };
}

const memoryStore = createMemoryOnboardingStore();

export function getOnboardingStore(): { store: OnboardingStore; persistence: "supabase" | "memory" } {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return {
      store: createSupabaseOnboardingStore({ url: environment.supabaseUrl, serviceRoleKey: environment.supabaseServiceRoleKey }),
      persistence: "supabase",
    };
  }
  return { store: memoryStore, persistence: "memory" };
}

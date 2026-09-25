import { readServerEnvironment } from "./env";
import type { OnboardingState } from "../onboarding-model";

export type OnboardingStore = {
  get(userId: string): Promise<OnboardingState | null>;
  save(userId: string, state: OnboardingState): Promise<void>;
  clear(userId: string): Promise<void>;
};

type OnboardingMemoryGlobal = typeof globalThis & {
  __vetolayerOnboardingMemory?: Map<string, OnboardingState>;
};

function memoryStates() {
  const shared = globalThis as OnboardingMemoryGlobal;
  shared.__vetolayerOnboardingMemory ??= new Map<string, OnboardingState>();
  return shared.__vetolayerOnboardingMemory;
}

export function createMemoryOnboardingStore(): OnboardingStore {
  return {
    async get(userId) {
      return memoryStates().get(userId) ?? null;
    },
    async save(userId, state) {
      memoryStates().set(userId, state);
    },
    async clear(userId) {
      memoryStates().delete(userId);
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
    throw new Error(
      `Onboarding persistence ${operation} failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`,
    );
  }

  return {
    async get(userId) {
      const query = new URLSearchParams({
        select: "state,updated_at",
        user_id: `eq.${userId}`,
        limit: "1",
      });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_onboarding_states?${query}`, { headers });
      await requireSuccess(response, "get");
      const rows = await response.json() as Array<{ state: OnboardingState; updated_at: string }>;
      const row = rows[0];
      if (!row) return null;
      return { ...row.state, updatedAt: row.updated_at };
    },

    async save(userId, state) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_onboarding_states`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: userId, state, updated_at: state.updatedAt }),
      });
      await requireSuccess(response, "save");
    },

    async clear(userId) {
      const query = new URLSearchParams({ user_id: `eq.${userId}` });
      const response = await fetchImpl(`${baseUrl}/rest/v1/vetolayer_onboarding_states?${query}`, {
        method: "DELETE",
        headers,
      });
      await requireSuccess(response, "clear");
    },
  };
}

const memoryStore = createMemoryOnboardingStore();

export function getOnboardingStore(): {
  store: OnboardingStore;
  persistence: "supabase" | "memory";
} {
  const environment = readServerEnvironment();
  if (environment.persistenceConfigured && environment.supabaseUrl && environment.supabaseServiceRoleKey) {
    return {
      store: createSupabaseOnboardingStore({
        url: environment.supabaseUrl,
        serviceRoleKey: environment.supabaseServiceRoleKey,
      }),
      persistence: "supabase",
    };
  }
  return { store: memoryStore, persistence: "memory" };
}

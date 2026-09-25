export const RELIABILITY_PROFILE_COOKIE = "vl_e2e_profile";

export const RELIABILITY_SCOPE = {
  workspaceId: "e2e-workspace",
  projectId: "e2e-project",
  environmentId: "e2e-production",
} as const;

export type ReliabilityProfile = "onboarding" | "operator";

export function isReliabilityTestMode(env: NodeJS.ProcessEnv = process.env) {
  return env.CI === "true"
    && env.VETOLAYER_E2E_MODE === "1"
    && env.VERCEL !== "1"
    && env.VERCEL_ENV !== "production";
}

export function reliabilityIdentity(profile: ReliabilityProfile) {
  return {
    userId: `e2e:${profile}`,
    email: `${profile}@reliability.vetolayer.local`,
    displayName: profile === "operator" ? "Reliability Operator" : "Reliability Onboarding",
  };
}

export function normalizeReliabilityProfile(value: string | null | undefined): ReliabilityProfile {
  return value === "onboarding" ? "onboarding" : "operator";
}

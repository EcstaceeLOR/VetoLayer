import type { Policy } from "@vetolayer/core";
import { materializePolicyVersion, type PolicyVersionRecord } from "../policy-lifecycle";
import { getPolicyLifecycleStore } from "./policy-lifecycle-store";

export type ManagedPolicyScope = { workspaceId: string; projectId: string; environmentId: string };

export async function loadManagedActivePolicyVersions(scope: ManagedPolicyScope): Promise<PolicyVersionRecord[]> {
  const { store } = getPolicyLifecycleStore();
  return store.listActiveForEnvironment(scope);
}

/**
 * Once a project/environment has active managed policies they are authoritative.
 * Untrusted API callers cannot add policy meaning to that governed scope.
 * Trusted adapters such as the GitHub gate may explicitly preserve built-in
 * safety policies, which are product code rather than caller-controlled input.
 */
export function composeManagedPolicySet(
  versions: PolicyVersionRecord[],
  fallbackPolicies: Policy[],
  options: { preserveTrustedFallback?: boolean } = {},
) {
  if (!versions.length) return { policies: fallbackPolicies, managedVersions: versions, source: "request" as const };

  const managedStableIds = new Set(versions.map((version) => version.policy.id));
  const managed = versions.map(materializePolicyVersion);
  const trustedFallback = options.preserveTrustedFallback
    ? fallbackPolicies.filter((policy) => !managedStableIds.has(policy.id))
    : [];
  return {
    policies: [...managed, ...trustedFallback],
    managedVersions: versions,
    source: options.preserveTrustedFallback ? "managed+trusted" as const : "managed" as const,
  };
}

export async function mergeManagedPolicies(
  scope: ManagedPolicyScope,
  fallbackPolicies: Policy[],
  options: { preserveTrustedFallback?: boolean } = {},
) {
  const versions = await loadManagedActivePolicyVersions(scope).catch(() => [] as PolicyVersionRecord[]);
  return composeManagedPolicySet(versions, fallbackPolicies, options);
}

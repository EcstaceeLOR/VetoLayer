import type { Policy } from "@vetolayer/core";
import { materializePolicyVersion, type PolicyVersionRecord } from "../policy-lifecycle";
import { getPolicyLifecycleStore } from "./policy-lifecycle-store";

export type ManagedPolicyScope = { workspaceId: string; projectId: string; environmentId: string };

export async function loadManagedActivePolicyVersions(scope: ManagedPolicyScope): Promise<PolicyVersionRecord[]> {
  const { store } = getPolicyLifecycleStore();
  return store.listActiveForEnvironment(scope);
}

export async function mergeManagedPolicies(scope: ManagedPolicyScope, fallbackPolicies: Policy[]) {
  const versions = await loadManagedActivePolicyVersions(scope).catch(() => [] as PolicyVersionRecord[]);
  if (!versions.length) return { policies: fallbackPolicies, managedVersions: versions, source: "request" as const };

  const managedStableIds = new Set(versions.map((version) => version.policy.id));
  const managed = versions.map(materializePolicyVersion);
  const callerPolicies = fallbackPolicies.filter((policy) => !managedStableIds.has(policy.id));
  return {
    policies: [...managed, ...callerPolicies],
    managedVersions: versions,
    source: callerPolicies.length ? "managed+request" as const : "managed" as const,
  };
}

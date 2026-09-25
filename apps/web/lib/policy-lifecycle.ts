import type { Policy } from "@vetolayer/core";
import { policyStudioStarters } from "./policy-studio";

export type PolicyLifecycleState = "draft" | "active" | "archived";

export type PolicyVersionRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  policyId: string;
  version: number;
  state: PolicyLifecycleState;
  policy: Policy;
  targetEnvironmentIds: string[];
  sourceTemplateId?: string;
  basedOnVersionId?: string;
  changeNote?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  archivedAt?: string;
};

export type ManagedPolicy = {
  policyId: string;
  state: PolicyLifecycleState;
  activeVersionId?: string;
  draftVersionId?: string;
  latestVersion: number;
  versions: PolicyVersionRecord[];
};

export type PolicyConflictSeverity = "info" | "warning" | "error";
export type PolicyConflict = {
  code: string;
  severity: PolicyConflictSeverity;
  message: string;
  policyId?: string;
  version?: number;
};

export type PolicyTemplate = {
  id: string;
  name: string;
  description: string;
  category: "source-control" | "deployment" | "security" | "finance" | "general";
  policy: Policy;
};

export type PolicyDiffEntry = {
  field: string;
  before: string;
  after: string;
};

export const policyStudioTemplates: PolicyTemplate[] = [
  {
    id: "template-draft-pr-block",
    name: "Block draft pull request execution",
    description: "Prevent autonomous merge or deployment while a pull request remains a draft.",
    category: "source-control",
    policy: policyStudioStarters[0]!,
  },
  {
    id: "template-current-human-approval",
    name: "Require current human approval",
    description: "Escalate production actions when current verified human approval is missing.",
    category: "deployment",
    policy: policyStudioStarters[1]!,
  },
  {
    id: "template-sensitive-context-gate",
    name: "Sensitive production change gate",
    description: "Use evidence-aware contextual reasoning for security-sensitive production changes.",
    category: "security",
    policy: policyStudioStarters[2]!,
  },
  {
    id: "template-protected-config-review",
    name: "Protected configuration review",
    description: "Require review before an autonomous agent modifies protected production configuration.",
    category: "deployment",
    policy: {
      id: "protected-config-review",
      name: "Protected configuration changes require review",
      description: "Route protected production configuration changes to human review before execution.",
      mode: "deterministic",
      severity: "critical",
      priority: 15,
      enabled: false,
      requiredEvidence: [],
      exceptions: [],
      scope: { actionTypes: ["configuration"], environments: ["production"] },
      rule: {
        effect: "review",
        match: "all",
        conditions: [{ field: "facts.protectedConfiguration", operator: "equals", value: true }],
      },
    },
  },
  {
    id: "template-high-value-payment",
    name: "High-value payment approval",
    description: "Require review for autonomous payment actions above a configured amount.",
    category: "finance",
    policy: {
      id: "high-value-payment-review",
      name: "High-value payments require review",
      description: "Require human review before an autonomous agent initiates a high-value payment.",
      mode: "deterministic",
      severity: "critical",
      priority: 20,
      enabled: false,
      requiredEvidence: [
        { key: "payment-approval", type: "approval", description: "Current authorized payment approval.", required: true, maxAgeSeconds: 3600 },
      ],
      exceptions: [],
      scope: { actionTypes: ["payment"], environments: ["production"] },
      rule: {
        effect: "review",
        match: "all",
        conditions: [{ field: "facts.amount", operator: "greater_than_or_equal", value: 10000 }],
      },
    },
  },
];

export function policyVersionReference(policyId: string, version: number) {
  return `${policyId}@v${version}`;
}

export function parsePolicyVersionReference(value: string): { policyId: string; version: number } | null {
  const match = /^(.*)@v([1-9]\d*)$/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  return { policyId: match[1], version: Number(match[2]) };
}

export function materializePolicyVersion(version: PolicyVersionRecord): Policy {
  return {
    ...version.policy,
    id: policyVersionReference(version.policyId, version.version),
    enabled: version.state === "active",
  } as Policy;
}

export function groupPolicyVersions(records: PolicyVersionRecord[]): ManagedPolicy[] {
  const groups = new Map<string, PolicyVersionRecord[]>();
  for (const record of records) {
    const current = groups.get(record.policyId) ?? [];
    current.push(record);
    groups.set(record.policyId, current);
  }

  return [...groups.entries()].map(([policyId, versions]) => {
    const sorted = [...versions].sort((a, b) => b.version - a.version);
    const active = sorted.find((version) => version.state === "active");
    const draft = sorted.find((version) => version.state === "draft");
    const state: PolicyLifecycleState = active ? "active" : draft ? "draft" : "archived";
    return {
      policyId,
      state,
      ...(active ? { activeVersionId: active.id } : {}),
      ...(draft ? { draftVersionId: draft.id } : {}),
      latestVersion: sorted[0]?.version ?? 0,
      versions: sorted,
    };
  }).sort((a, b) => {
    const left = a.versions[0]?.policy.name ?? a.policyId;
    const right = b.versions[0]?.policy.name ?? b.policyId;
    return left.localeCompare(right);
  });
}

export function policyActivationWarnings(candidate: PolicyVersionRecord, activeVersions: PolicyVersionRecord[]): PolicyConflict[] {
  const warnings: PolicyConflict[] = [];
  if (!candidate.targetEnvironmentIds.length) {
    warnings.push({ code: "NO_TARGET_ENVIRONMENT", severity: "error", message: "Select at least one project environment before activation." });
  }
  if (!candidate.policy.scope?.tools?.length && !candidate.policy.scope?.actionTypes?.length) {
    warnings.push({ code: "BROAD_ACTION_SCOPE", severity: "warning", message: "This policy has no tool or action-type restriction and may govern a broad set of actions." });
  }
  if (candidate.policy.mode === "contextual" && candidate.policy.requiredEvidence.length === 0) {
    warnings.push({ code: "CONTEXT_WITHOUT_EVIDENCE", severity: "warning", message: "This contextual policy has no required evidence. Consider adding evidence requirements before activation." });
  }
  if (candidate.policy.mode === "deterministic" && candidate.policy.rule.effect === "allow") {
    warnings.push({ code: "EXPLICIT_ALLOW_RULE", severity: "warning", message: "Explicit ALLOW rules should be narrow. Confirm this scope cannot weaken a stricter control." });
  }

  for (const active of activeVersions) {
    if (active.policyId === candidate.policyId) continue;
    if (!environmentTargetsOverlap(candidate.targetEnvironmentIds, active.targetEnvironmentIds)) continue;
    if (!policyScopesOverlap(candidate.policy, active.policy)) continue;

    const ref = { policyId: active.policyId, version: active.version };
    if (candidate.policy.priority === active.policy.priority) {
      warnings.push({ code: "SAME_PRIORITY_OVERLAP", severity: "warning", message: `Overlapping policy ${active.policy.name} v${active.version} has the same priority ${active.policy.priority}.`, ...ref });
    }
    if (candidate.policy.mode === "deterministic" && active.policy.mode === "deterministic") {
      const candidateEffect = candidate.policy.rule.effect;
      const activeEffect = active.policy.rule.effect;
      if (candidateEffect !== activeEffect) {
        const hardConflict = new Set([candidateEffect, activeEffect]).has("allow") && new Set([candidateEffect, activeEffect]).has("block");
        warnings.push({
          code: "OVERLAPPING_DETERMINISTIC_EFFECTS",
          severity: hardConflict ? "error" : "warning",
          message: `Overlapping deterministic policy ${active.policy.name} v${active.version} resolves to ${activeEffect.toUpperCase()} while this version resolves to ${candidateEffect.toUpperCase()}.`,
          ...ref,
        });
      }
    }
  }

  return warnings;
}

export function diffPolicyVersions(left: PolicyVersionRecord, right: PolicyVersionRecord): PolicyDiffEntry[] {
  const before = flattenForDiff({ policy: left.policy, targetEnvironmentIds: left.targetEnvironmentIds });
  const after = flattenForDiff({ policy: right.policy, targetEnvironmentIds: right.targetEnvironmentIds });
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .sort()
    .flatMap((field) => before[field] === after[field] ? [] : [{ field, before: before[field] ?? "—", after: after[field] ?? "—" }]);
}

function environmentTargetsOverlap(left: string[], right: string[]) {
  if (!left.length || !right.length) return true;
  const rightSet = new Set(right);
  return left.some((id) => rightSet.has(id));
}

function policyScopesOverlap(left: Policy, right: Policy) {
  return listScopesOverlap(left.scope?.tools, right.scope?.tools)
    && listScopesOverlap(left.scope?.actionTypes, right.scope?.actionTypes)
    && listScopesOverlap(left.scope?.environments, right.scope?.environments);
}

function listScopesOverlap(left?: string[], right?: string[]) {
  if (!left?.length || !right?.length) return true;
  const normalized = new Set(right.map((value) => value.toLowerCase()));
  return left.some((value) => normalized.has(value.toLowerCase()));
}

function flattenForDiff(value: unknown, prefix = ""): Record<string, string> {
  if (value === null || typeof value !== "object") return { [prefix || "value"]: JSON.stringify(value) };
  if (Array.isArray(value)) return { [prefix || "value"]: JSON.stringify(value) };
  const entries: Record<string, string> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) Object.assign(entries, flattenForDiff(child, path));
    else entries[path] = JSON.stringify(child);
  }
  return entries;
}

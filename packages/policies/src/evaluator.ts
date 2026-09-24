import type {
  ActionRequest,
  DeterministicPolicy,
  Evidence,
  EvidenceRequirement,
  Finding,
  JsonValue,
  Policy,
} from "@vetolayer/core";

export type DeterministicFacts = Record<string, JsonValue>;

export type DeterministicEvaluationInput = {
  action: ActionRequest;
  policies: Policy[];
  evidence?: Evidence[];
  facts?: DeterministicFacts;
  now?: Date;
};

export type DeterministicOutcome = "ALLOW" | "REVIEW" | "BLOCK";

export type DeterministicEvaluationResult = {
  outcome: DeterministicOutcome;
  hardBlock: boolean;
  findings: Finding[];
  appliedPolicyIds: string[];
  contextualPolicyIds: string[];
  missingEvidence: EvidenceRequirement[];
};

type ConditionEvaluation = {
  matched: boolean;
  invalid: boolean;
};

export function evaluateDeterministicPolicies({
  action,
  policies,
  evidence = [],
  facts = {},
  now = new Date(),
}: DeterministicEvaluationInput): DeterministicEvaluationResult {
  const applicable = policies
    .filter((policy) => policy.enabled && policyApplies(policy, action))
    .sort((a, b) => a.priority - b.priority);

  const contextualPolicyIds = applicable
    .filter((policy) => policy.mode === "contextual")
    .map((policy) => policy.id);

  const deterministicPolicies = applicable.filter(
    (policy): policy is DeterministicPolicy => policy.mode === "deterministic",
  );

  const findings: Finding[] = [];
  const appliedPolicyIds: string[] = [];
  const missingEvidence = collectMissingEvidence(applicable, evidence, now);

  let outcome: DeterministicOutcome = missingEvidence.length > 0 ? "REVIEW" : "ALLOW";
  let hardBlock = false;

  const evaluationRoot = {
    action,
    facts,
  };

  for (const policy of deterministicPolicies) {
    appliedPolicyIds.push(policy.id);

    const conditionResults = policy.rule.conditions.map((condition) =>
      evaluateCondition(
        getPathValue(evaluationRoot, condition.field),
        condition.operator,
        condition.value,
      ),
    );

    if (conditionResults.some((result) => result.invalid)) {
      outcome = outcome === "BLOCK" ? "BLOCK" : "REVIEW";
      findings.push({
        id: `${policy.id}:invalid-rule`,
        policyId: policy.id,
        source: "deterministic",
        status: "uncertain",
        severity: policy.severity,
        summary: `Policy ${policy.name} could not be evaluated safely because one or more conditions are invalid.`,
        evidenceIds: evidenceIdsForPolicy(policy, evidence, now),
      });
      continue;
    }

    const matched =
      policy.rule.match === "all"
        ? conditionResults.every((result) => result.matched)
        : conditionResults.some((result) => result.matched);

    if (!matched) {
      findings.push({
        id: `${policy.id}:not-matched`,
        policyId: policy.id,
        source: "deterministic",
        status: "pass",
        severity: policy.severity,
        summary: `Policy ${policy.name} did not match this action.`,
        evidenceIds: evidenceIdsForPolicy(policy, evidence, now),
      });
      continue;
    }

    if (policy.rule.effect === "block") {
      findings.push({
        id: `${policy.id}:block`,
        policyId: policy.id,
        source: "deterministic",
        status: "fail",
        severity: policy.severity,
        summary: `Policy ${policy.name} matched an explicit BLOCK rule.`,
        evidenceIds: evidenceIdsForPolicy(policy, evidence, now),
      });
      outcome = "BLOCK";
      hardBlock = true;
      break;
    }

    if (policy.rule.effect === "review") {
      findings.push({
        id: `${policy.id}:review`,
        policyId: policy.id,
        source: "deterministic",
        status: "uncertain",
        severity: policy.severity,
        summary: `Policy ${policy.name} matched and requires human review.`,
        evidenceIds: evidenceIdsForPolicy(policy, evidence, now),
      });
      outcome = "REVIEW";
      continue;
    }

    findings.push({
      id: `${policy.id}:allow`,
      policyId: policy.id,
      source: "deterministic",
      status: "pass",
      severity: policy.severity,
      summary: `Policy ${policy.name} matched an explicit ALLOW rule.`,
      evidenceIds: evidenceIdsForPolicy(policy, evidence, now),
    });
  }

  return {
    outcome,
    hardBlock,
    findings,
    appliedPolicyIds,
    contextualPolicyIds,
    missingEvidence,
  };
}

function policyApplies(policy: Policy, action: ActionRequest): boolean {
  if (!policy.scope) return true;

  const environment = action.target.environment ?? action.context.environment;

  if (
    policy.scope.actionTypes &&
    !policy.scope.actionTypes.includes(action.action.type)
  ) {
    return false;
  }

  if (policy.scope.tools && !policy.scope.tools.includes(action.action.tool)) {
    return false;
  }

  if (
    policy.scope.environments &&
    (!environment || !policy.scope.environments.includes(environment))
  ) {
    return false;
  }

  return true;
}

function collectMissingEvidence(
  policies: Policy[],
  evidence: Evidence[],
  now: Date,
): EvidenceRequirement[] {
  const missing = new Map<string, EvidenceRequirement>();

  for (const policy of policies) {
    for (const requirement of policy.requiredEvidence) {
      if (!requirement.required) continue;

      const satisfied = evidence.some((item) =>
        satisfiesEvidenceRequirement(item, requirement, now),
      );

      if (!satisfied) {
        missing.set(`${policy.id}:${requirement.key}`, requirement);
      }
    }
  }

  return [...missing.values()];
}

function satisfiesEvidenceRequirement(
  evidence: Evidence,
  requirement: EvidenceRequirement,
  now: Date,
): boolean {
  if (evidence.type !== requirement.type) return false;
  if (evidence.verification.status !== "verified") return false;

  const nowMs = now.getTime();
  const observedAtMs = Date.parse(evidence.observedAt);

  if (Number.isNaN(observedAtMs) || observedAtMs > nowMs) return false;

  if (evidence.expiresAt && Date.parse(evidence.expiresAt) <= nowMs) {
    return false;
  }

  if (
    requirement.maxAgeSeconds !== undefined &&
    nowMs - observedAtMs > requirement.maxAgeSeconds * 1_000
  ) {
    return false;
  }

  return true;
}

function evidenceIdsForPolicy(
  policy: DeterministicPolicy,
  evidence: Evidence[],
  now: Date,
): string[] {
  const types = new Set(policy.requiredEvidence.map((requirement) => requirement.type));

  return evidence
    .filter((item) => {
      if (!types.has(item.type)) return false;
      if (item.verification.status !== "verified") return false;
      if (item.expiresAt && Date.parse(item.expiresAt) <= now.getTime()) return false;
      return true;
    })
    .map((item) => item.id);
}

function getPathValue(root: unknown, path: string): unknown {
  const segments = path.split(".").filter(Boolean);
  let current: unknown = root;

  for (const segment of segments) {
    if (
      current === null ||
      typeof current !== "object" ||
      Array.isArray(current) ||
      !(segment in current)
    ) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function evaluateCondition(
  actual: unknown,
  operator: DeterministicPolicy["rule"]["conditions"][number]["operator"],
  expected: JsonValue | undefined,
): ConditionEvaluation {
  if (operator === "exists") {
    return { matched: actual !== undefined && actual !== null, invalid: false };
  }

  if (operator === "not_exists") {
    return { matched: actual === undefined || actual === null, invalid: false };
  }

  if (expected === undefined) {
    return { matched: false, invalid: true };
  }

  switch (operator) {
    case "equals":
      return { matched: jsonEqual(actual, expected), invalid: false };
    case "not_equals":
      return { matched: !jsonEqual(actual, expected), invalid: false };
    case "greater_than":
      return numericCompare(actual, expected, (a, b) => a > b);
    case "greater_than_or_equal":
      return numericCompare(actual, expected, (a, b) => a >= b);
    case "less_than":
      return numericCompare(actual, expected, (a, b) => a < b);
    case "less_than_or_equal":
      return numericCompare(actual, expected, (a, b) => a <= b);
    case "in":
      return arrayMembership(actual, expected, false);
    case "not_in":
      return arrayMembership(actual, expected, true);
    default:
      return { matched: false, invalid: true };
  }
}

function numericCompare(
  actual: unknown,
  expected: JsonValue,
  compare: (actualNumber: number, expectedNumber: number) => boolean,
): ConditionEvaluation {
  if (typeof actual !== "number" || typeof expected !== "number") {
    return { matched: false, invalid: true };
  }

  return { matched: compare(actual, expected), invalid: false };
}

function arrayMembership(
  actual: unknown,
  expected: JsonValue,
  negate: boolean,
): ConditionEvaluation {
  if (!Array.isArray(expected)) {
    return { matched: false, invalid: true };
  }

  const contains = expected.some((candidate) => jsonEqual(actual, candidate));
  return { matched: negate ? !contains : contains, invalid: false };
}

function jsonEqual(actual: unknown, expected: JsonValue): boolean {
  try {
    return JSON.stringify(actual) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

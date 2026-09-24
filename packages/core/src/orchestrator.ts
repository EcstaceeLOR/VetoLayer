import type {
  ActionRequest,
  ContextualPolicy,
  Decision,
  Evidence,
  EvidenceContradiction,
  EvidenceRequirement,
  Finding,
  JsonValue,
  Policy,
} from "./schemas";

export type DeterministicAdapterResult = {
  outcome: "ALLOW" | "REVIEW" | "BLOCK";
  hardBlock: boolean;
  findings: Finding[];
  appliedPolicyIds: string[];
  contextualPolicyIds: string[];
  missingEvidence: EvidenceRequirement[];
};

export type ContextualPolicyFinding = {
  policyId: string;
  status: "pass" | "fail" | "uncertain";
  summary: string;
  evidenceIds: string[];
};

export type ContextualMissingEvidence = {
  policyId: string;
  key: string;
  description: string;
};

export type ContextualDecisionSnapshot = {
  recommendedOutcome: "ALLOW" | "REVIEW" | "BLOCK";
  policyFindings: ContextualPolicyFinding[];
  evidenceUsed: string[];
  missingEvidence: ContextualMissingEvidence[];
  contradictoryEvidence: EvidenceContradiction[];
  exceptionAnalysis: Array<{
    policyId: string;
    exceptionId: string;
    applies: boolean;
    satisfiedCriteria: string[];
    unsatisfiedCriteria: string[];
    summary: string;
  }>;
  rationale: string;
  confidence?: number;
};

export type ContextualAdapterResult = {
  decision: ContextualDecisionSnapshot;
  trace?: {
    providerStatus?: string;
    [key: string]: unknown;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

export type DeterministicEvaluator = (input: {
  action: ActionRequest;
  policies: Policy[];
  evidence: Evidence[];
  facts: Record<string, JsonValue>;
  now: Date;
}) => DeterministicAdapterResult | Promise<DeterministicAdapterResult>;

export type ContextualEvaluator = (input: {
  action: ActionRequest;
  contextualPolicies: ContextualPolicy[];
  deterministicFindings: Finding[];
  evidence: Evidence[];
  environment?: Record<string, unknown>;
}) => ContextualAdapterResult | Promise<ContextualAdapterResult>;

export type DecisionTraceStep = {
  step:
    | "policy-resolution"
    | "deterministic-evaluation"
    | "contextual-evaluation"
    | "decision-combination";
  status: "completed" | "skipped" | "fallback";
  summary: string;
  policyIds?: string[];
};

export type DecisionOrchestratorInput = {
  action: ActionRequest;
  policies: Policy[];
  evidence?: Evidence[];
  facts?: Record<string, JsonValue>;
  environment?: Record<string, unknown>;
  now?: Date;
  decisionId?: string;
};

export type DecisionOrchestratorAdapters = {
  evaluateDeterministic: DeterministicEvaluator;
  evaluateContextual?: ContextualEvaluator;
};

export type DecisionOrchestrationResult = {
  decision: Decision;
  trace: DecisionTraceStep[];
  contextualTrace?: ContextualAdapterResult["trace"];
};

export async function evaluateAction(
  input: DecisionOrchestratorInput,
  adapters: DecisionOrchestratorAdapters,
): Promise<DecisionOrchestrationResult> {
  const evidence = input.evidence ?? [];
  const facts = input.facts ?? {};
  const now = input.now ?? new Date();
  const trace: DecisionTraceStep[] = [];

  const enabledPolicyIds = input.policies
    .filter((policy) => policy.enabled)
    .map((policy) => policy.id);

  trace.push({
    step: "policy-resolution",
    status: "completed",
    summary: `${enabledPolicyIds.length} enabled policies were supplied for evaluation.`,
    policyIds: enabledPolicyIds,
  });

  const deterministic = await adapters.evaluateDeterministic({
    action: input.action,
    policies: input.policies,
    evidence,
    facts,
    now,
  });

  trace.push({
    step: "deterministic-evaluation",
    status: "completed",
    summary: deterministic.hardBlock
      ? "A deterministic hard BLOCK matched. Contextual reasoning cannot override it."
      : `Deterministic evaluation completed with ${deterministic.outcome}.`,
    policyIds: deterministic.appliedPolicyIds,
  });

  const contextualPolicies = selectContextualPolicies(
    input.policies,
    deterministic.contextualPolicyIds,
  );

  if (deterministic.hardBlock) {
    trace.push({
      step: "contextual-evaluation",
      status: "skipped",
      summary: "SERV contextual reasoning was skipped because an explicit hard BLOCK already applies.",
      policyIds: contextualPolicies.map((policy) => policy.id),
    });

    const decision = buildDecision({
      input,
      now,
      outcome: "BLOCK",
      deterministic,
      contextualFindings: [],
      contextualMissingEvidence: [],
      contradictoryEvidence: [],
      contextualPolicyIds: [],
      summary: "Blocked by deterministic policy enforcement.",
    });

    trace.push({
      step: "decision-combination",
      status: "completed",
      summary: "Final outcome is BLOCK because hard deterministic policy takes precedence.",
    });

    return { decision, trace };
  }

  if (contextualPolicies.length === 0) {
    trace.push({
      step: "contextual-evaluation",
      status: "skipped",
      summary: "No applicable contextual policy required SERV reasoning.",
    });

    const outcome = criticalEvidenceMissing(input.policies, deterministic.missingEvidence)
      ? "REVIEW"
      : deterministic.outcome;

    const decision = buildDecision({
      input,
      now,
      outcome,
      deterministic,
      contextualFindings: [],
      contextualMissingEvidence: [],
      contradictoryEvidence: [],
      contextualPolicyIds: [],
      summary:
        outcome === "ALLOW"
          ? "Allowed by deterministic policy evaluation."
          : "Human review is required by deterministic policy evaluation.",
    });

    trace.push({
      step: "decision-combination",
      status: "completed",
      summary: `Final outcome is ${outcome}; no contextual judgment was required.`,
    });

    return { decision, trace };
  }

  let contextual: ContextualAdapterResult;
  try {
    if (!adapters.evaluateContextual) {
      throw new Error("No contextual evaluator is configured.");
    }

    contextual = await adapters.evaluateContextual({
      action: input.action,
      contextualPolicies,
      deterministicFindings: deterministic.findings,
      evidence,
      environment: input.environment,
    });
  } catch (error) {
    contextual = fallbackContextualResult(
      contextualPolicies,
      error instanceof Error ? error.message : "Contextual evaluator failed.",
    );
  }

  const contextualFallback =
    contextual.trace?.providerStatus === "fallback" || Boolean(contextual.error);

  trace.push({
    step: "contextual-evaluation",
    status: contextualFallback ? "fallback" : "completed",
    summary: contextualFallback
      ? "Contextual evaluation could not be validated, so VetoLayer escalated safely to REVIEW."
      : `Contextual evaluation completed with ${contextual.decision.recommendedOutcome}.`,
    policyIds: contextualPolicies.map((policy) => policy.id),
  });

  const contextualFindings = toCoreContextualFindings(
    contextual.decision.policyFindings,
    contextualPolicies,
  );
  const hasCriticalMissingEvidence = criticalEvidenceMissing(
    input.policies,
    deterministic.missingEvidence,
  );
  const hasConflict = hasHighSeverityConflict([
    ...deterministic.findings,
    ...contextualFindings,
  ]);

  const outcome = combineOutcomes({
    deterministicOutcome: deterministic.outcome,
    contextualOutcome: contextual.decision.recommendedOutcome,
    contextualFallback,
    hasCriticalMissingEvidence,
    hasConflict,
  });

  const decision = buildDecision({
    input,
    now,
    outcome,
    deterministic,
    contextualFindings,
    contextualMissingEvidence: contextual.decision.missingEvidence,
    contradictoryEvidence: contextual.decision.contradictoryEvidence,
    contextualPolicyIds: contextualPolicies.map((policy) => policy.id),
    confidence: contextualFallback ? 0 : contextual.decision.confidence,
    summary: contextualFallback
      ? "Human review is required because a validated contextual judgment was unavailable."
      : contextual.decision.rationale,
  });

  trace.push({
    step: "decision-combination",
    status: "completed",
    summary: describeCombination({
      outcome,
      contextualFallback,
      hasCriticalMissingEvidence,
      hasConflict,
    }),
  });

  return {
    decision,
    trace,
    contextualTrace: contextual.trace,
  };
}

export function createDecisionOrchestrator(adapters: DecisionOrchestratorAdapters) {
  return {
    evaluate(input: DecisionOrchestratorInput) {
      return evaluateAction(input, adapters);
    },
  };
}

function selectContextualPolicies(
  policies: Policy[],
  contextualPolicyIds: string[],
): ContextualPolicy[] {
  const ids = new Set(contextualPolicyIds);
  return policies.filter(
    (policy): policy is ContextualPolicy =>
      policy.mode === "contextual" && policy.enabled && ids.has(policy.id),
  );
}

function toCoreContextualFindings(
  findings: ContextualPolicyFinding[],
  policies: ContextualPolicy[],
): Finding[] {
  const severityByPolicy = new Map(
    policies.map((policy) => [policy.id, policy.severity] as const),
  );

  return findings.map((finding, index) => ({
    id: `${finding.policyId}:contextual:${index + 1}`,
    policyId: finding.policyId,
    source: "contextual",
    status: finding.status,
    severity: severityByPolicy.get(finding.policyId) ?? "high",
    summary: finding.summary,
    evidenceIds: finding.evidenceIds,
  }));
}

function criticalEvidenceMissing(
  policies: Policy[],
  missingEvidence: EvidenceRequirement[],
): boolean {
  const missingKeys = new Set(missingEvidence.map((requirement) => requirement.key));
  const missingTypes = new Set(missingEvidence.map((requirement) => requirement.type));

  return policies.some(
    (policy) =>
      policy.enabled &&
      policy.severity === "critical" &&
      policy.requiredEvidence.some(
        (requirement) =>
          requirement.required &&
          (missingKeys.has(requirement.key) || missingTypes.has(requirement.type)),
      ),
  );
}

function hasHighSeverityConflict(findings: Finding[]): boolean {
  const material = findings.filter(
    (finding) => finding.severity === "high" || finding.severity === "critical",
  );
  const hasPass = material.some((finding) => finding.status === "pass");
  const hasFail = material.some((finding) => finding.status === "fail");
  return hasPass && hasFail;
}

function combineOutcomes(input: {
  deterministicOutcome: "ALLOW" | "REVIEW" | "BLOCK";
  contextualOutcome: "ALLOW" | "REVIEW" | "BLOCK";
  contextualFallback: boolean;
  hasCriticalMissingEvidence: boolean;
  hasConflict: boolean;
}): "ALLOW" | "REVIEW" | "BLOCK" {
  if (input.deterministicOutcome === "BLOCK" || input.contextualOutcome === "BLOCK") {
    return "BLOCK";
  }

  if (
    input.contextualFallback ||
    input.hasCriticalMissingEvidence ||
    input.hasConflict ||
    input.deterministicOutcome === "REVIEW" ||
    input.contextualOutcome === "REVIEW"
  ) {
    return "REVIEW";
  }

  return "ALLOW";
}

function buildDecision(input: {
  input: DecisionOrchestratorInput;
  now: Date;
  outcome: "ALLOW" | "REVIEW" | "BLOCK";
  deterministic: DeterministicAdapterResult;
  contextualFindings: Finding[];
  contextualMissingEvidence: ContextualMissingEvidence[];
  contradictoryEvidence: EvidenceContradiction[];
  contextualPolicyIds: string[];
  confidence?: number;
  summary: string;
}): Decision {
  const contextualMissing: EvidenceRequirement[] = input.contextualMissingEvidence.map(
    (requirement) => ({
      key: `${requirement.policyId}:${requirement.key}`,
      type: "contextual-evidence",
      description: requirement.description,
      required: true,
    }),
  );

  return {
    id:
      input.input.decisionId ??
      `decision_${input.input.action.id}_${input.now.getTime()}`,
    actionRequestId: input.input.action.id,
    outcome: input.outcome,
    deterministicFindings: input.deterministic.findings,
    contextualFindings: input.contextualFindings,
    missingEvidence: dedupeMissingEvidence([
      ...input.deterministic.missingEvidence,
      ...contextualMissing,
    ]),
    contradictoryEvidence: input.contradictoryEvidence,
    appliedPolicyIds: [
      ...new Set([
        ...input.deterministic.appliedPolicyIds,
        ...input.contextualPolicyIds,
      ]),
    ],
    confidence: input.confidence,
    summary: input.summary,
    decidedAt: input.now.toISOString(),
  };
}

function dedupeMissingEvidence(
  requirements: EvidenceRequirement[],
): EvidenceRequirement[] {
  const seen = new Set<string>();
  return requirements.filter((requirement) => {
    const key = `${requirement.key}:${requirement.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackContextualResult(
  policies: ContextualPolicy[],
  message: string,
): ContextualAdapterResult {
  return {
    decision: {
      recommendedOutcome: "REVIEW",
      policyFindings: policies.map((policy) => ({
        policyId: policy.id,
        status: "uncertain",
        summary: "Contextual policy could not be safely evaluated.",
        evidenceIds: [],
      })),
      evidenceUsed: [],
      missingEvidence: [],
      contradictoryEvidence: [],
      exceptionAnalysis: [],
      rationale:
        "A validated contextual judgment was unavailable, so VetoLayer requires human review.",
      confidence: 0,
    },
    trace: { providerStatus: "fallback" },
    error: { code: "CONTEXTUAL_EVALUATION_FAILED", message },
  };
}

function describeCombination(input: {
  outcome: "ALLOW" | "REVIEW" | "BLOCK";
  contextualFallback: boolean;
  hasCriticalMissingEvidence: boolean;
  hasConflict: boolean;
}): string {
  if (input.outcome === "BLOCK") {
    return "Final outcome is BLOCK because at least one enforceable decision path requires blocking the action.";
  }
  if (input.contextualFallback) {
    return "Final outcome is REVIEW because contextual reasoning failed safely rather than failing open.";
  }
  if (input.hasCriticalMissingEvidence) {
    return "Final outcome is REVIEW because critical required evidence is missing.";
  }
  if (input.hasConflict) {
    return "Final outcome is REVIEW because high-severity findings conflict.";
  }
  return `Final outcome is ${input.outcome} after combining deterministic and contextual findings.`;
}

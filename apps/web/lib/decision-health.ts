import type { DecisionReceipt } from "@vetolayer/core";

export type DecisionHealthSummary = {
  total: number;
  outcomes: { ALLOW: number; REVIEW: number; BLOCK: number };
  servAssisted: number;
  deterministicOnly: number;
  unresolvedReviews: number;
  evidenceCompleteness: number;
  evidenceTrendDelta: number;
  tools: Array<{ tool: string; total: number; friction: number }>;
  topPolicies: Array<{ policyId: string; count: number; outcomes: Array<"REVIEW" | "BLOCK"> }>;
};

export function summarizeDecisionHealth(receipts: DecisionReceipt[]): DecisionHealthSummary {
  const ordered = [...receipts].sort((a, b) =>
    b.timestamps.decidedAt.localeCompare(a.timestamps.decidedAt),
  );

  const outcomes = { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
  const toolMap = new Map<string, { total: number; friction: number }>();
  const policyMap = new Map<string, { count: number; outcomes: Set<"REVIEW" | "BLOCK"> }>();

  let servAssisted = 0;
  for (const receipt of ordered) {
    outcomes[receipt.outcome] += 1;
    if (receipt.contextualFindings.length > 0 || receipt.providerTrace) servAssisted += 1;

    const tool = receipt.action.tool || "unknown";
    const toolStats = toolMap.get(tool) ?? { total: 0, friction: 0 };
    toolStats.total += 1;
    if (receipt.outcome !== "ALLOW") toolStats.friction += 1;
    toolMap.set(tool, toolStats);

    if (receipt.outcome !== "ALLOW") {
      const findings = [...receipt.deterministicFindings, ...receipt.contextualFindings];
      for (const finding of findings.filter((item) => item.status !== "pass")) {
        const current = policyMap.get(finding.policyId) ?? { count: 0, outcomes: new Set<"REVIEW" | "BLOCK">() };
        current.count += 1;
        current.outcomes.add(receipt.outcome);
        policyMap.set(finding.policyId, current);
      }
    }
  }

  const latestByAction = new Map<string, DecisionReceipt>();
  for (const receipt of ordered) {
    if (!latestByAction.has(receipt.action.requestId)) latestByAction.set(receipt.action.requestId, receipt);
  }

  const completeness = ordered.map(evidenceCompletenessForReceipt);
  const midpoint = Math.max(1, Math.ceil(completeness.length / 2));
  const recentAverage = average(completeness.slice(0, midpoint));
  const previousAverage = average(completeness.slice(midpoint));

  return {
    total: ordered.length,
    outcomes,
    servAssisted,
    deterministicOnly: ordered.length - servAssisted,
    unresolvedReviews: [...latestByAction.values()].filter((receipt) => receipt.outcome === "REVIEW").length,
    evidenceCompleteness: Math.round(recentAverage),
    evidenceTrendDelta: Math.round(recentAverage - previousAverage),
    tools: [...toolMap.entries()]
      .map(([tool, stats]) => ({ tool, ...stats }))
      .sort((a, b) => b.total - a.total || b.friction - a.friction),
    topPolicies: [...policyMap.entries()]
      .map(([policyId, stats]) => ({
        policyId,
        count: stats.count,
        outcomes: [...stats.outcomes],
      }))
      .sort((a, b) => b.count - a.count || a.policyId.localeCompare(b.policyId))
      .slice(0, 5),
  };
}

export function evidenceCompletenessForReceipt(receipt: DecisionReceipt): number {
  const referencedEvidence = new Set(
    [...receipt.deterministicFindings, ...receipt.contextualFindings].flatMap((finding) => finding.evidenceIds),
  ).size;
  const suppliedEvidence = Math.max(referencedEvidence, receipt.evidenceUsed.length);
  const missingEvidence = receipt.missingEvidence.length;
  const expected = suppliedEvidence + missingEvidence;

  if (expected === 0) return 100;
  return (suppliedEvidence / expected) * 100;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

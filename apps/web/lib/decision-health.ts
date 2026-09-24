import type { DecisionReceipt } from "@vetolayer/core";

export type DecisionHealthMode = "live" | "seeded-demo";

export type DecisionHealthOverview = {
  mode: DecisionHealthMode;
  total: number;
  counts: { ALLOW: number; REVIEW: number; BLOCK: number };
  unresolvedReviews: number;
  servAssisted: number;
  deterministicOnly: number;
  providerFallbacks: number;
  averageEvidenceCompleteness: number;
  tools: Array<{ tool: string; count: number }>;
  topPolicies: Array<{
    policyId: string;
    count: number;
    reviewCount: number;
    blockCount: number;
  }>;
  evidenceTrend: Array<{
    receiptId: string;
    outcome: "ALLOW" | "REVIEW" | "BLOCK";
    completeness: number;
    decidedAt: string;
  }>;
  recent: Array<{
    receiptId: string;
    decisionId: string;
    outcome: "ALLOW" | "REVIEW" | "BLOCK";
    tool: string;
    operation: string;
    target: string;
    decidedAt: string;
    servAssisted: boolean;
    missingEvidence: number;
    summary: string;
  }>;
};

export function buildDecisionHealthOverview(input: {
  receipts: DecisionReceipt[];
  unresolvedReviews: number;
  mode?: DecisionHealthMode;
  recentLimit?: number;
}): DecisionHealthOverview {
  const sorted = [...input.receipts].sort((a, b) =>
    b.timestamps.decidedAt.localeCompare(a.timestamps.decidedAt),
  );
  const counts = { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
  const tools = new Map<string, number>();
  const policyFriction = new Map<
    string,
    { count: number; reviewCount: number; blockCount: number }
  >();
  let servAssisted = 0;
  let providerFallbacks = 0;
  let evidenceCompletenessTotal = 0;

  for (const receipt of sorted) {
    counts[receipt.outcome] += 1;
    tools.set(receipt.action.tool, (tools.get(receipt.action.tool) ?? 0) + 1);

    const assisted =
      receipt.contextualFindings.length > 0 || Boolean(receipt.providerTrace);
    if (assisted) servAssisted += 1;
    if (receipt.providerTrace?.providerStatus === "fallback") {
      providerFallbacks += 1;
    }

    evidenceCompletenessTotal += evidenceCompleteness(receipt);

    if (receipt.outcome === "REVIEW" || receipt.outcome === "BLOCK") {
      const materialPolicyIds = new Set(
        [...receipt.deterministicFindings, ...receipt.contextualFindings]
          .filter((finding) => finding.status === "fail" || finding.status === "uncertain")
          .map((finding) => finding.policyId),
      );

      for (const policyId of materialPolicyIds) {
        const current = policyFriction.get(policyId) ?? {
          count: 0,
          reviewCount: 0,
          blockCount: 0,
        };
        current.count += 1;
        if (receipt.outcome === "REVIEW") current.reviewCount += 1;
        if (receipt.outcome === "BLOCK") current.blockCount += 1;
        policyFriction.set(policyId, current);
      }
    }
  }

  const recentLimit = Math.max(1, Math.min(25, input.recentLimit ?? 8));
  const recentReceipts = sorted.slice(0, recentLimit);

  return {
    mode: input.mode ?? "live",
    total: sorted.length,
    counts,
    unresolvedReviews: Math.max(0, input.unresolvedReviews),
    servAssisted,
    deterministicOnly: sorted.length - servAssisted,
    providerFallbacks,
    averageEvidenceCompleteness:
      sorted.length === 0
        ? 100
        : Math.round(evidenceCompletenessTotal / sorted.length),
    tools: [...tools.entries()]
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool)),
    topPolicies: [...policyFriction.entries()]
      .map(([policyId, values]) => ({ policyId, ...values }))
      .sort((a, b) => b.count - a.count || a.policyId.localeCompare(b.policyId))
      .slice(0, 6),
    evidenceTrend: recentReceipts.map((receipt) => ({
      receiptId: receipt.receiptId,
      outcome: receipt.outcome,
      completeness: evidenceCompleteness(receipt),
      decidedAt: receipt.timestamps.decidedAt,
    })),
    recent: recentReceipts.map((receipt) => ({
      receiptId: receipt.receiptId,
      decisionId: receipt.decisionId,
      outcome: receipt.outcome,
      tool: receipt.action.tool,
      operation: receipt.action.operation,
      target: receipt.action.targetId ?? receipt.action.targetType,
      decidedAt: receipt.timestamps.decidedAt,
      servAssisted:
        receipt.contextualFindings.length > 0 || Boolean(receipt.providerTrace),
      missingEvidence: receipt.missingEvidence.length,
      summary: receipt.decisionSummary,
    })),
  };
}

export function evidenceCompleteness(receipt: DecisionReceipt): number {
  const used = new Set(
    [
      ...receipt.evidenceUsed.map((item) => item.id),
      ...receipt.deterministicFindings.flatMap((finding) => finding.evidenceIds),
      ...receipt.contextualFindings.flatMap((finding) => finding.evidenceIds),
    ].filter(Boolean),
  ).size;
  const missing = receipt.missingEvidence.length;

  if (used === 0 && missing === 0) return 100;
  return Math.round((used / (used + missing)) * 100);
}

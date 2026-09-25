import { renderDecisionReceiptSummary, type DecisionReceipt } from "@vetolayer/core";
import type { DecisionQuery, DecisionReviewState, DecisionSort, StoredDecision } from "./server/decision-store";

export type ExplorerSearchParams = Record<string, string | string[] | undefined>;

const outcomes = new Set(["ALLOW", "REVIEW", "BLOCK"]);
const sources = new Set(["api", "integration"]);
const reviewStates = new Set<DecisionReviewState>(["none", "pending", "awaiting_evidence", "resolved"]);
const sorts = new Set<DecisionSort>(["newest", "oldest", "outcome", "action"]);

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function clean(value: string | undefined, max = 200) { const normalized = value?.trim(); return normalized ? normalized.slice(0, max) : undefined; }
function dateBoundary(value: string | undefined, end: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const iso = `${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

export function parseDecisionExplorerQuery(params: ExplorerSearchParams): DecisionQuery {
  const outcome = single(params.outcome)?.toUpperCase();
  const source = single(params.source);
  const reviewState = single(params.review);
  const sort = single(params.sort);
  const serv = single(params.serv);
  const page = Number(single(params.page) ?? 1);
  const pageSize = Number(single(params.pageSize) ?? 25);
  const search = clean(single(params.q));
  const projectId = clean(single(params.project));
  const environmentId = clean(single(params.environment));
  const tool = clean(single(params.tool), 120);
  const policy = clean(single(params.policy));
  const from = dateBoundary(single(params.from), false);
  const to = dateBoundary(single(params.to), true);
  return {
    ...(search ? { search } : {}),
    ...(outcome && outcomes.has(outcome) ? { outcome: outcome as DecisionQuery["outcome"] } : {}),
    ...(projectId ? { projectId } : {}),
    ...(environmentId ? { environmentId } : {}),
    ...(source && sources.has(source) ? { source: source as DecisionQuery["source"] } : {}),
    ...(tool ? { tool } : {}),
    ...(policy ? { policy } : {}),
    ...(serv === "yes" ? { serv: true } : serv === "no" ? { serv: false } : {}),
    ...(reviewState && reviewStates.has(reviewState as DecisionReviewState) ? { reviewState: reviewState as DecisionReviewState } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(sort && sorts.has(sort as DecisionSort) ? { sort: sort as DecisionSort } : { sort: "newest" }),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: [10, 25, 50, 100].includes(pageSize) ? pageSize : 25,
  };
}

export function decisionExplorerHref(query: DecisionQuery, overrides: Partial<DecisionQuery> = {}) {
  const next = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (next.search) params.set("q", next.search);
  if (next.outcome) params.set("outcome", next.outcome);
  if (next.projectId) params.set("project", next.projectId);
  if (next.environmentId) params.set("environment", next.environmentId);
  if (next.source) params.set("source", next.source);
  if (next.tool) params.set("tool", next.tool);
  if (next.policy) params.set("policy", next.policy);
  if (next.serv !== undefined) params.set("serv", next.serv ? "yes" : "no");
  if (next.reviewState) params.set("review", next.reviewState);
  if (next.from) params.set("from", next.from.slice(0, 10));
  if (next.to) params.set("to", next.to.slice(0, 10));
  if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
  if (next.page && next.page > 1) params.set("page", String(next.page));
  if (next.pageSize && next.pageSize !== 25) params.set("pageSize", String(next.pageSize));
  const suffix = params.toString();
  return `/dashboard/decisions${suffix ? `?${suffix}` : ""}`;
}

export type ReceiptComparisonRow = { field: string; before: string; after: string; changed: boolean };

export function compareDecisionReceipts(before: DecisionReceipt, after: DecisionReceipt): ReceiptComparisonRow[] {
  const values: Array<[string, string, string]> = [
    ["Outcome", before.outcome, after.outcome],
    ["Decision summary", before.decisionSummary, after.decisionSummary],
    ["Policy versions", before.policiesEvaluated.map((item) => item.id).join(", ") || "None", after.policiesEvaluated.map((item) => item.id).join(", ") || "None"],
    ["Deterministic findings", findingSummary(before.deterministicFindings), findingSummary(after.deterministicFindings)],
    ["SERV findings", findingSummary(before.contextualFindings), findingSummary(after.contextualFindings)],
    ["Evidence used", before.evidenceUsed.map((item) => `${item.type}:${item.id}`).join(", ") || "None", after.evidenceUsed.map((item) => `${item.type}:${item.id}`).join(", ") || "None"],
    ["Missing evidence", before.missingEvidence.map((item) => item.description).join("; ") || "None", after.missingEvidence.map((item) => item.description).join("; ") || "None"],
    ["Contradictions", before.contradictoryEvidence.map((item) => item.description).join("; ") || "None", after.contradictoryEvidence.map((item) => item.description).join("; ") || "None"],
    ["SERV used", before.contextualFindings.length || before.providerTrace ? "Yes" : "No", after.contextualFindings.length || after.providerTrace ? "Yes" : "No"],
    ["Decided at", before.timestamps.decidedAt, after.timestamps.decidedAt],
  ];
  return values.map(([field, left, right]) => ({ field, before: left, after: right, changed: left !== right }));
}

function findingSummary(findings: DecisionReceipt["deterministicFindings"]) {
  return findings.map((item) => `${item.policyId}:${item.status}`).join(", ") || "None";
}

const sensitiveExportKeys = new Set([
  "authorization", "apikey", "api_key", "accesstoken", "access_token", "privatekey", "private_key",
  "clientsecret", "client_secret", "webhooksecret", "webhook_secret", "password",
]);

export function findSensitiveExportPath(value: unknown, path = "$", seen = new WeakSet<object>()): string | null {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value as object)) return null;
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSensitiveExportPath(value[index], `${path}[${index}]`, seen);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const compact = key.replace(/[-\s]/g, "").toLowerCase();
    if (sensitiveExportKeys.has(compact) || sensitiveExportKeys.has(key.toLowerCase())) return `${path}.${key}`;
    const found = findSensitiveExportPath(child, `${path}.${key}`, seen);
    if (found) return found;
  }
  return null;
}

export function renderDecisionIncidentReport(input: {
  record: StoredDecision;
  projectName?: string;
  environmentName?: string;
  integrityVerified: boolean;
  reviewTimeline?: Array<{ createdAt: string; summary: string; actor?: { name?: string; id: string } }>;
}) {
  const receipt = input.record.receipt;
  const lines = [
    "VetoLayer Incident Review Export",
    "================================",
    "",
    renderDecisionReceiptSummary(receipt),
    "",
    `Project: ${input.projectName ?? input.record.projectId ?? "Unscoped"}`,
    `Environment: ${input.environmentName ?? input.record.environmentId ?? "Unscoped"}`,
    `Source: ${input.record.source}`,
    `Integrity verified: ${input.integrityVerified ? "YES" : "NO"}`,
    `Request lineage key: ${receipt.action.requestId}`,
    ...(input.record.parentReceiptId ? [`Parent receipt: ${input.record.parentReceiptId}`] : []),
    ...(input.record.reviewCaseId ? [`Review case: ${input.record.reviewCaseId}`, `Review state: ${input.record.reviewState ?? "none"}`] : []),
    "",
    "Deterministic findings",
    ...receipt.deterministicFindings.map((item) => `- [${item.status.toUpperCase()}] ${item.policyId}: ${item.summary}`),
    "",
    "SERV findings",
    ...(receipt.contextualFindings.length ? receipt.contextualFindings.map((item) => `- [${item.status.toUpperCase()}] ${item.policyId}: ${item.summary}`) : ["- SERV was not used for this decision."]),
    "",
    "Evidence",
    ...(receipt.evidenceUsed.length ? receipt.evidenceUsed.map((item) => `- ${item.id} (${item.type}) · ${item.verification.status}`) : ["- No evidence objects were included in the signed receipt."]),
    "",
    "Review timeline",
    ...(input.reviewTimeline?.length ? input.reviewTimeline.map((item) => `- ${item.createdAt} · ${item.actor?.name ?? item.actor?.id ?? "System"} · ${item.summary}`) : ["- No operational review timeline is linked to this receipt."]),
    "",
    `Exported from receipt ${receipt.receiptId}. This report contains signed receipt data and operational review metadata only.`,
  ];
  return lines.join("\n");
}

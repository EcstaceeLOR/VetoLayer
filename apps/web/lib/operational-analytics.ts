import type { DecisionReceipt } from "@vetolayer/core";
import type { AuditEvent } from "./server/audit-store";
import type { StoredDecision } from "./server/decision-store";
import type { ReviewCase } from "./server/review-store";
import { evidenceCompletenessForReceipt } from "./decision-health";

export type AnalyticsFilters = {
  from: string;
  to: string;
  projectId?: string;
  environmentId?: string;
};

export type AnalyticsTrendPoint = {
  key: string;
  label: string;
  total: number;
  ALLOW: number;
  REVIEW: number;
  BLOCK: number;
  evidenceCompleteness: number;
  missingEvidence: number;
};

export type OperationalAnalyticsReport = {
  filters: AnalyticsFilters;
  truncated: boolean;
  auditTruncated: boolean;
  excludedDemoDecisions: number;
  summary: {
    total: number;
    outcomes: { ALLOW: number; REVIEW: number; BLOCK: number };
    frictionRate: number;
    frictionRateDelta: number;
  };
  trend: AnalyticsTrendPoint[];
  volume: {
    projects: Array<{ id: string; total: number; friction: number }>;
    environments: Array<{ id: string; total: number; friction: number }>;
    integrations: Array<{ key: string; label: string; total: number; friction: number }>;
  };
  policies: Array<{ policyId: string; name: string; total: number; review: number; block: number }>;
  reviews: {
    created: number;
    resolved: number;
    averageTurnaroundHours: number | null;
    medianTurnaroundHours: number | null;
    unresolved: number;
    overdue: number;
    aging: { under4h: number; from4to24h: number; from24to72h: number; over72h: number };
  };
  evidence: {
    averageCompleteness: number;
    decisionsMissingEvidence: number;
    totalMissingRequirements: number;
    topMissing: Array<{ key: string; description: string; count: number }>;
  };
  reasoning: {
    deterministicOnly: number;
    servAssisted: number;
    servRatio: number;
    servFallbacks: number;
    servFallbackRate: number;
    averageLatencyMs: number | null;
    p95LatencyMs: number | null;
    usage: { samples: number; promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };
  };
  reevaluations: {
    total: number;
    outcomes: { ALLOW: number; REVIEW: number; BLOCK: number };
    reasons: { evidenceChange: number; approval: number; rejection: number };
  };
  integrations: { events: number; failures: number; disconnects: number; failureRate: number };
};

type AnalyticsInput = {
  decisions: StoredDecision[];
  reviews: ReviewCase[];
  auditEvents: AuditEvent[];
  filters: AnalyticsFilters;
  now?: Date;
  truncated?: boolean;
  auditTruncated?: boolean;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function inWindow(value: string, filters: AnalyticsFilters) {
  const timestamp = Date.parse(value);
  const from = Date.parse(filters.from);
  const to = Date.parse(filters.to);
  return Number.isFinite(timestamp) && timestamp >= from && timestamp <= to;
}

function inScope(value: { projectId?: string; environmentId?: string }, filters: AnalyticsFilters) {
  if (filters.projectId && value.projectId !== filters.projectId) return false;
  if (filters.environmentId && value.environmentId !== filters.environmentId) return false;
  return true;
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function rounded(value: number, precision = 1) {
  const power = 10 ** precision;
  return Math.round(value * power) / power;
}

function median(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[midpoint] ?? null;
  const left = ordered[midpoint - 1];
  const right = ordered[midpoint];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function logicalPolicyId(value: string) { return value.replace(/@v\d+$/i, ""); }
function integrationLabel(decision: StoredDecision) {
  if (decision.source === "api") return "Developer API";
  if (decision.source === "integration") return decision.receipt.action.tool || "Integration";
  return "Demo";
}

function safeTraceNumber(trace: Record<string, unknown> | undefined, key: string) {
  const value = trace?.[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeUsage(receipt: DecisionReceipt) {
  const usage = receipt.providerTrace?.usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const row = usage as Record<string, unknown>;
  const value = (key: string) => typeof row[key] === "number" && Number.isFinite(row[key]) && Number(row[key]) >= 0 ? Number(row[key]) : null;
  return { promptTokens: value("promptTokens"), completionTokens: value("completionTokens"), totalTokens: value("totalTokens") };
}

function bucketDefinition(filters: AnalyticsFilters) {
  const from = Date.parse(filters.from);
  const to = Date.parse(filters.to);
  const days = Math.max(1, Math.ceil((to - from) / DAY));
  if (days <= 31) return { kind: "day" as const, step: DAY };
  if (days <= 180) return { kind: "week" as const, step: 7 * DAY };
  return { kind: "month" as const, step: 0 };
}

function trendKey(value: string, filters: AnalyticsFilters) {
  const timestamp = Date.parse(value);
  const date = new Date(timestamp);
  const definition = bucketDefinition(filters);
  if (definition.kind === "month") return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  if (definition.kind === "day") return date.toISOString().slice(0, 10);
  const from = Date.parse(filters.from);
  return `week-${Math.max(0, Math.floor((timestamp - from) / definition.step))}`;
}

function trendLabel(key: string, filters: AnalyticsFilters) {
  if (key.startsWith("week-")) {
    const index = Number(key.slice(5));
    const start = new Date(Date.parse(filters.from) + index * 7 * DAY);
    const end = new Date(start.getTime() + 6 * DAY);
    return `${start.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}–${end.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  }
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [year, month] = key.split("-").map(Number);
    return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  return new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function buildOperationalAnalytics(input: AnalyticsInput): OperationalAnalyticsReport {
  const allInScope = input.decisions.filter((decision) => inScope(decision, input.filters) && inWindow(decision.createdAt, input.filters));
  const excludedDemoDecisions = allInScope.filter((decision) => decision.source === "demo").length;
  const decisions = allInScope.filter((decision) => decision.source !== "demo");
  const reviews = input.reviews.filter((review) => inScope(review, input.filters) && inWindow(review.createdAt, input.filters));
  const auditEvents = input.auditEvents.filter((event) => event.category === "integration" && inScope(event, input.filters) && inWindow(event.createdAt, input.filters));

  const outcomes = { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
  const projectVolume = new Map<string, { total: number; friction: number }>();
  const environmentVolume = new Map<string, { total: number; friction: number }>();
  const integrationVolume = new Map<string, { label: string; total: number; friction: number }>();
  const policyStats = new Map<string, { name: string; total: number; review: number; block: number }>();
  const missingStats = new Map<string, { description: string; count: number }>();
  const trend = new Map<string, { total: number; ALLOW: number; REVIEW: number; BLOCK: number; completeness: number[]; missing: number }>();
  const completeness: number[] = [];
  const latencies: number[] = [];
  let decisionsMissingEvidence = 0;
  let totalMissingRequirements = 0;
  let servAssisted = 0;
  let servFallbacks = 0;
  let usageSamples = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let hasPrompt = false;
  let hasCompletion = false;
  let hasTotal = false;

  for (const decision of decisions) {
    const receipt = decision.receipt;
    outcomes[receipt.outcome] += 1;
    const friction = receipt.outcome !== "ALLOW" ? 1 : 0;
    if (decision.projectId) incrementVolume(projectVolume, decision.projectId, friction);
    if (decision.environmentId) incrementVolume(environmentVolume, decision.environmentId, friction);
    const integrationKey = decision.source === "integration" ? `integration:${receipt.action.tool}` : decision.source;
    const integration = integrationVolume.get(integrationKey) ?? { label: integrationLabel(decision), total: 0, friction: 0 };
    integration.total += 1;
    integration.friction += friction;
    integrationVolume.set(integrationKey, integration);

    if (receipt.outcome !== "ALLOW") {
      const counted = new Set<string>();
      for (const finding of [...receipt.deterministicFindings, ...receipt.contextualFindings]) {
        if (finding.status === "pass") continue;
        const policyId = logicalPolicyId(finding.policyId);
        if (counted.has(policyId)) continue;
        counted.add(policyId);
        const policyReceipt = receipt.policiesEvaluated.find((policy) => logicalPolicyId(policy.id) === policyId);
        const current = policyStats.get(policyId) ?? { name: policyReceipt?.name ?? policyId, total: 0, review: 0, block: 0 };
        current.total += 1;
        if (receipt.outcome === "REVIEW") current.review += 1;
        if (receipt.outcome === "BLOCK") current.block += 1;
        policyStats.set(policyId, current);
      }
    }

    const score = evidenceCompletenessForReceipt(receipt);
    completeness.push(score);
    if (receipt.missingEvidence.length) decisionsMissingEvidence += 1;
    totalMissingRequirements += receipt.missingEvidence.length;
    for (const missing of receipt.missingEvidence) {
      const current = missingStats.get(missing.key) ?? { description: missing.description, count: 0 };
      current.count += 1;
      missingStats.set(missing.key, current);
    }

    const bucket = trendKey(decision.createdAt, input.filters);
    const point = trend.get(bucket) ?? { total: 0, ALLOW: 0, REVIEW: 0, BLOCK: 0, completeness: [], missing: 0 };
    point.total += 1;
    point[receipt.outcome] += 1;
    point.completeness.push(score);
    point.missing += receipt.missingEvidence.length;
    trend.set(bucket, point);

    const usesServ = receipt.contextualFindings.length > 0 || Boolean(receipt.providerTrace);
    if (usesServ) {
      servAssisted += 1;
      if (receipt.providerTrace?.providerStatus === "fallback") servFallbacks += 1;
      const latency = safeTraceNumber(receipt.providerTrace, "latencyMs");
      if (latency !== null) latencies.push(latency);
      const usage = safeUsage(receipt);
      if (usage) {
        usageSamples += 1;
        if (usage.promptTokens !== null) { promptTokens += usage.promptTokens; hasPrompt = true; }
        if (usage.completionTokens !== null) { completionTokens += usage.completionTokens; hasCompletion = true; }
        if (usage.totalTokens !== null) { totalTokens += usage.totalTokens; hasTotal = true; }
      }
    }
  }

  const ordered = [...decisions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const midpoint = Math.floor(ordered.length / 2);
  const firstHalf = ordered.slice(0, midpoint || ordered.length);
  const secondHalf = midpoint ? ordered.slice(midpoint) : [];
  const rate = (values: StoredDecision[]) => percentage(values.filter((decision) => decision.receipt.outcome !== "ALLOW").length, values.length);
  const frictionRate = rate(decisions);
  const frictionRateDelta = secondHalf.length ? rounded(rate(secondHalf) - rate(firstHalf), 2) : 0;

  const referenceTime = Math.min(input.now?.getTime() ?? Date.now(), Date.parse(input.filters.to));
  const turnaround: number[] = [];
  let resolved = 0;
  let unresolved = 0;
  let overdue = 0;
  const aging = { under4h: 0, from4to24h: 0, from24to72h: 0, over72h: 0 };
  for (const review of reviews) {
    const resolution = [...review.timeline].reverse().find((event) => event.type === "resolved" && Date.parse(event.createdAt) <= Date.parse(input.filters.to));
    if (resolution) {
      resolved += 1;
      const hours = (Date.parse(resolution.createdAt) - Date.parse(review.createdAt)) / HOUR;
      if (Number.isFinite(hours) && hours >= 0) turnaround.push(hours);
      continue;
    }
    unresolved += 1;
    const age = Math.max(0, (referenceTime - Date.parse(review.createdAt)) / HOUR);
    if (review.dueAt && Date.parse(review.dueAt) <= referenceTime) overdue += 1;
    if (age < 4) aging.under4h += 1;
    else if (age < 24) aging.from4to24h += 1;
    else if (age < 72) aging.from24to72h += 1;
    else aging.over72h += 1;
  }

  const reevaluations = {
    total: 0,
    outcomes: { ALLOW: 0, REVIEW: 0, BLOCK: 0 },
    reasons: { evidenceChange: 0, approval: 0, rejection: 0 },
  };
  for (const review of input.reviews.filter((candidate) => inScope(candidate, input.filters))) {
    for (const item of review.receiptLineage) {
      if (item.reason === "initial" || !inWindow(item.createdAt, input.filters)) continue;
      reevaluations.total += 1;
      reevaluations.outcomes[item.outcome] += 1;
      if (item.reason === "evidence-change") reevaluations.reasons.evidenceChange += 1;
      else reevaluations.reasons[item.reason] += 1;
    }
  }

  const failurePattern = /(fail|error|revok|unhealthy|degrad)/i;
  const disconnectPattern = /disconnect/i;
  const integrationFailures = auditEvents.filter((event) => failurePattern.test(event.action)).length;
  const integrationDisconnects = auditEvents.filter((event) => disconnectPattern.test(event.action)).length;
  const orderedLatencies = [...latencies].sort((a, b) => a - b);
  const p95Index = orderedLatencies.length ? Math.min(orderedLatencies.length - 1, Math.ceil(orderedLatencies.length * 0.95) - 1) : -1;

  return {
    filters: input.filters,
    truncated: Boolean(input.truncated),
    auditTruncated: Boolean(input.auditTruncated),
    excludedDemoDecisions,
    summary: { total: decisions.length, outcomes, frictionRate, frictionRateDelta },
    trend: [...trend.entries()].map(([key, point]) => ({
      key,
      label: trendLabel(key, input.filters),
      total: point.total,
      ALLOW: point.ALLOW,
      REVIEW: point.REVIEW,
      BLOCK: point.BLOCK,
      evidenceCompleteness: rounded(average(point.completeness), 1),
      missingEvidence: point.missing,
    })).sort((a, b) => trendSortValue(a.key) - trendSortValue(b.key)),
    volume: {
      projects: volumeRows(projectVolume),
      environments: volumeRows(environmentVolume),
      integrations: [...integrationVolume.entries()].map(([key, row]) => ({ key, ...row })).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    },
    policies: [...policyStats.entries()].map(([policyId, stats]) => ({ policyId, ...stats })).sort((a, b) => b.total - a.total || b.block - a.block || a.policyId.localeCompare(b.policyId)).slice(0, 10),
    reviews: {
      created: reviews.length,
      resolved,
      averageTurnaroundHours: turnaround.length ? rounded(average(turnaround), 1) : null,
      medianTurnaroundHours: turnaround.length ? rounded(median(turnaround) ?? 0, 1) : null,
      unresolved,
      overdue,
      aging,
    },
    evidence: {
      averageCompleteness: completeness.length ? rounded(average(completeness), 1) : 0,
      decisionsMissingEvidence,
      totalMissingRequirements,
      topMissing: [...missingStats.entries()].map(([key, row]) => ({ key, ...row })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, 10),
    },
    reasoning: {
      deterministicOnly: decisions.length - servAssisted,
      servAssisted,
      servRatio: percentage(servAssisted, decisions.length),
      servFallbacks,
      servFallbackRate: percentage(servFallbacks, servAssisted),
      averageLatencyMs: latencies.length ? Math.round(average(latencies)) : null,
      p95LatencyMs: p95Index >= 0 ? Math.round(orderedLatencies[p95Index] ?? 0) : null,
      usage: { samples: usageSamples, promptTokens: hasPrompt ? promptTokens : null, completionTokens: hasCompletion ? completionTokens : null, totalTokens: hasTotal ? totalTokens : null },
    },
    reevaluations,
    integrations: { events: auditEvents.length, failures: integrationFailures, disconnects: integrationDisconnects, failureRate: percentage(integrationFailures, auditEvents.length) },
  };
}

function incrementVolume(map: Map<string, { total: number; friction: number }>, key: string, friction: number) {
  const current = map.get(key) ?? { total: 0, friction: 0 };
  current.total += 1;
  current.friction += friction;
  map.set(key, current);
}

function volumeRows(map: Map<string, { total: number; friction: number }>) {
  return [...map.entries()].map(([id, row]) => ({ id, ...row })).sort((a, b) => b.total - a.total || b.friction - a.friction || a.id.localeCompare(b.id));
}

function trendSortValue(key: string) {
  if (key.startsWith("week-")) return Number(key.slice(5));
  if (/^\d{4}-\d{2}$/.test(key)) return Date.parse(`${key}-01T00:00:00.000Z`);
  return Date.parse(`${key}T00:00:00.000Z`);
}

export function buildDecisionExplorerUrl(filters: AnalyticsFilters, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams({ from: filters.from.slice(0, 10), to: filters.to.slice(0, 10) });
  if (filters.projectId) params.set("project", filters.projectId);
  if (filters.environmentId) params.set("environment", filters.environmentId);
  for (const [key, value] of Object.entries(extra)) {
    if (!value) continue;
    if (key === "projectId") params.set("project", value);
    else if (key === "environmentId") params.set("environment", value);
    else if (key === "reviewState") params.set("review", value);
    else if (key === "serv") params.set("serv", value === "true" ? "yes" : value === "false" ? "no" : value);
    else params.set(key, value);
  }
  return `/dashboard/decisions?${params.toString()}`;
}

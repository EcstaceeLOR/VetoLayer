import type { Project, ProjectEnvironment } from "../workspace-model";
import { hasWorkspacePermission } from "../workspace-model";
import { buildOperationalAnalytics, type AnalyticsFilters, type OperationalAnalyticsReport } from "../operational-analytics";
import { getAuditStore } from "./audit-store";
import { getDecisionStore } from "./decision-store";
import { getReviewStore } from "./review-store";
import { getAuthenticatedIdentity } from "./workspace";
import { getWorkspaceStore } from "./workspace-store";

const MAX_DECISIONS = 5_000;
const MAX_AUDIT_EVENTS = 5_000;
const PAGE_SIZE = 100;
const DAY = 24 * 60 * 60 * 1000;

export type AnalyticsData = {
  report: OperationalAnalyticsReport;
  projects: Project[];
  environments: ProjectEnvironment[];
  persistence: {
    decisions: "supabase" | "memory";
    reviews: "supabase" | "memory";
    audit: "supabase" | "memory";
  };
  auditAvailable: boolean;
};

export function defaultAnalyticsFilters(now = new Date(), days = 30): AnalyticsFilters {
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);
  const from = new Date(to.getTime() - (Math.max(1, days) - 1) * DAY);
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function parseDate(value: string | null, endOfDay: boolean) {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseAnalyticsFilters(params: URLSearchParams, now = new Date()): AnalyticsFilters {
  const range = params.get("range");
  const presetDays = range === "7" ? 7 : range === "90" ? 90 : range === "180" ? 180 : range === "365" ? 365 : 30;
  const fallback = defaultAnalyticsFilters(now, presetDays);
  const from = parseDate(params.get("from"), false);
  const to = parseDate(params.get("to"), true);
  const validWindow = from && to && from.getTime() <= to.getTime();
  return {
    from: validWindow ? from.toISOString() : fallback.from,
    to: validWindow ? to.toISOString() : fallback.to,
    ...(params.get("projectId") ? { projectId: params.get("projectId")! } : {}),
    ...(params.get("environmentId") ? { environmentId: params.get("environmentId")! } : {}),
  };
}

export async function loadOperationalAnalytics(workspaceId: string, requestedFilters: AnalyticsFilters, now = new Date()): Promise<AnalyticsData> {
  const { store: workspaceStore } = getWorkspaceStore();
  const projects = await workspaceStore.listProjects(workspaceId, true);
  const projectIds = new Set(projects.map((project) => project.id));
  const selectedProjectId = requestedFilters.projectId && projectIds.has(requestedFilters.projectId) ? requestedFilters.projectId : undefined;

  const environments = (await Promise.all(projects.map((project) => workspaceStore.listEnvironments(workspaceId, project.id, true)))).flat();
  const environment = requestedFilters.environmentId
    ? environments.find((candidate) => candidate.id === requestedFilters.environmentId && (!selectedProjectId || candidate.projectId === selectedProjectId))
    : undefined;
  const filters: AnalyticsFilters = {
    from: requestedFilters.from,
    to: requestedFilters.to,
    ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
    ...(environment ? { environmentId: environment.id } : {}),
  };

  const { store: decisionStore, persistence: decisionPersistence } = getDecisionStore();
  const decisions = [] as Awaited<ReturnType<typeof decisionStore.query>>["decisions"];
  let page = 1;
  let total = 0;
  let hasNext = true;
  while (hasNext && decisions.length < MAX_DECISIONS) {
    const result = await decisionStore.query(workspaceId, {
      from: filters.from,
      to: filters.to,
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.environmentId ? { environmentId: filters.environmentId } : {}),
      page,
      pageSize: PAGE_SIZE,
      sort: "oldest",
    });
    total = result.total;
    decisions.push(...result.decisions.slice(0, MAX_DECISIONS - decisions.length));
    hasNext = result.hasNext;
    page += 1;
  }

  const { store: reviewStore, persistence: reviewPersistence } = getReviewStore();
  const reviews = await reviewStore.list(workspaceId, {
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.environmentId ? { environmentId: filters.environmentId } : {}),
  });

  const { store: auditStore, persistence: auditPersistence } = getAuditStore();
  const identity = await getAuthenticatedIdentity();
  const membership = identity ? await workspaceStore.getMembership(workspaceId, identity.userId) : null;
  const canReadAudit = Boolean(membership && hasWorkspacePermission(membership.role, "audit.read"));
  let auditEvents: Awaited<ReturnType<typeof auditStore.list>> = [];
  let auditAvailable = canReadAudit;
  if (canReadAudit) {
    try {
      auditEvents = await auditStore.list(workspaceId, {
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.environmentId ? { environmentId: filters.environmentId } : {}),
        from: filters.from,
        to: filters.to,
        limit: MAX_AUDIT_EVENTS,
      });
    } catch {
      auditAvailable = false;
    }
  }

  return {
    report: buildOperationalAnalytics({
      decisions,
      reviews,
      auditEvents,
      filters,
      now,
      truncated: total > decisions.length,
      auditTruncated: auditAvailable && auditEvents.length >= MAX_AUDIT_EVENTS,
    }),
    projects,
    environments,
    persistence: { decisions: decisionPersistence, reviews: reviewPersistence, audit: auditPersistence },
    auditAvailable,
  };
}

export function analyticsFilterQuery(filters: AnalyticsFilters) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.environmentId) params.set("environmentId", filters.environmentId);
  return params.toString();
}

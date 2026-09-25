import { verifyDecisionReceipt, type DecisionReceipt } from "@vetolayer/core";
import type { DashboardDecision } from "../dashboard-data";
import type { DecisionQuery, DecisionPage, StoredDecision } from "./decision-store";
import { getDecisionStore } from "./decision-store";
import { getReviewStore, type ReviewCase } from "./review-store";
import { getAuthenticatedWorkspace } from "./workspace";
import { getWorkspaceStore } from "./workspace-store";

export type DashboardDataMode = "live" | "empty";

export type DashboardDecisionFeed = {
  decisions: DashboardDecision[];
  mode: DashboardDataMode;
  persistence: "supabase" | "memory";
};

export type ExplorerDecision = {
  record: StoredDecision;
  decision: DashboardDecision;
  projectName?: string;
  environmentName?: string;
};

export type DecisionExplorerData = {
  decisions: ExplorerDecision[];
  page: DecisionPage;
  projects: Array<{ id: string; name: string; status: string }>;
  environments: Array<{ id: string; projectId: string; name: string; status: string }>;
  workspaceId: string;
  mode: DashboardDataMode;
  persistence: "supabase" | "memory";
};

export type ReceiptCenterData = {
  record: StoredDecision;
  decision: DashboardDecision;
  integrityVerified: boolean;
  lineage: StoredDecision[];
  reviewCase?: ReviewCase;
  projectName?: string;
  environmentName?: string;
  mode: DashboardDataMode;
};

export async function loadDashboardDecisionFeed(limit = 100): Promise<DashboardDecisionFeed> {
  const { store, persistence } = getDecisionStore();
  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) return { decisions: [], mode: "empty", persistence };
  const records = await store.list(workspace.workspaceId, limit, { projectId: workspace.projectId, environmentId: workspace.environmentId });
  if (records.length > 0) return { decisions: records.map((record) => presentReceipt(record.receipt)), mode: "live", persistence };
  return { decisions: [], mode: "empty", persistence };
}

export async function loadDecisionExplorer(query: DecisionQuery): Promise<DecisionExplorerData | null> {
  const workspace = await getAuthenticatedWorkspace();
  const { store, persistence } = getDecisionStore();
  if (!workspace) return null;
  const { store: workspaceStore } = getWorkspaceStore();
  const projects = await workspaceStore.listProjects(workspace.workspaceId, true);
  const environments = (await Promise.all(projects.map((project) => workspaceStore.listEnvironments(workspace.workspaceId, project.id, true)))).flat();
  const page = await store.query(workspace.workspaceId, query);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const environmentNames = new Map(environments.map((environment) => [environment.id, environment.name]));
  return {
    decisions: page.decisions.map((record) => ({
      record,
      decision: presentReceipt(record.receipt),
      ...(record.projectId && projectNames.get(record.projectId) ? { projectName: projectNames.get(record.projectId) } : {}),
      ...(record.environmentId && environmentNames.get(record.environmentId) ? { environmentName: environmentNames.get(record.environmentId) } : {}),
    })),
    page,
    projects: projects.map(({ id, name, status }) => ({ id, name, status })),
    environments: environments.map(({ id, projectId, name, status }) => ({ id, projectId, name, status })),
    workspaceId: workspace.workspaceId,
    mode: page.total > 0 ? "live" : "empty",
    persistence,
  };
}

export async function loadDecisionReceiptCenter(id: string): Promise<ReceiptCenterData | undefined> {
  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) return undefined;
  const { store } = getDecisionStore();
  const record = await store.get(workspace.workspaceId, id);
  if (!record) return undefined;
  const lineage = await store.lineage(workspace.workspaceId, record.receipt.action.requestId);
  const integrityVerified = await verifyDecisionReceipt(record.receipt);
  const { store: workspaceStore } = getWorkspaceStore();
  const project = record.projectId ? await workspaceStore.getProject(workspace.workspaceId, record.projectId) : null;
  const environment = record.projectId && record.environmentId
    ? await workspaceStore.getEnvironment(workspace.workspaceId, record.projectId, record.environmentId)
    : null;
  const reviewCase = await findReviewCase(workspace.workspaceId, record);
  return {
    record,
    decision: presentReceipt(record.receipt),
    integrityVerified,
    lineage,
    ...(reviewCase ? { reviewCase } : {}),
    ...(project ? { projectName: project.name } : {}),
    ...(environment ? { environmentName: environment.name } : {}),
    mode: "live",
  };
}

async function findReviewCase(workspaceId: string, record: StoredDecision) {
  const { store } = getReviewStore();
  if (record.reviewCaseId) {
    const direct = await store.get(workspaceId, record.reviewCaseId);
    if (direct) return direct;
  }
  const cases = await store.list(workspaceId);
  return cases.find((reviewCase) => reviewCase.receiptLineage.some((entry) => entry.receiptId === record.receipt.receiptId));
}

export async function loadDashboardDecision(id: string): Promise<DashboardDecision | undefined> {
  const center = await loadDecisionReceiptCenter(id);
  return center?.decision;
}

export function presentReceipt(receipt: DecisionReceipt): DashboardDecision {
  const targetLabel = receipt.action.targetId ?? receipt.action.targetType;
  return { ...receipt, display: { title: `${humanize(receipt.action.operation)} — ${targetLabel}`, repository: targetLabel, relativeTime: formatRelativeTime(receipt.timestamps.decidedAt) } };
}

function humanize(value: string) { return value.split("-").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function formatRelativeTime(iso: string) {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "recently";
  const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

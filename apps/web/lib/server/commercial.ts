import { canConsume, getCommercialPlan, usageState, type CommercialLimitKey } from "../commercial-plans";
import { getDecisionStore } from "./decision-store";
import { getWorkspacePlanStore } from "./commercial-store";
import { getWorkspaceStore } from "./workspace-store";

export type WorkspaceCommercialUsage = {
  periodStart: string;
  periodEnd: string;
  activeProjects: number;
  activeMembers: number;
  pendingInvitations: number;
  reservedSeats: number;
  decisions: number;
  servEvaluations: number;
};

export type UsageMeter = {
  key: CommercialLimitKey;
  label: string;
  current: number;
  limit: number | null;
  state: ReturnType<typeof usageState>;
};

export class EntitlementLimitError extends Error {
  constructor(
    public readonly planId: string,
    public readonly metric: CommercialLimitKey,
    public readonly current: number,
    public readonly limit: number,
  ) {
    super(`The ${planId} plan limit for ${metric} has been reached.`);
    this.name = "EntitlementLimitError";
  }
}

function monthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

export async function getWorkspaceCommercialUsage(workspaceId: string, now = new Date()): Promise<WorkspaceCommercialUsage> {
  const { periodStart, periodEnd } = monthWindow(now);
  const { store: workspaceStore } = getWorkspaceStore();
  const { store: decisionStore } = getDecisionStore();
  const [projects, members, invitations, decisions, serv] = await Promise.all([
    workspaceStore.listProjects(workspaceId),
    workspaceStore.listMembers(workspaceId),
    workspaceStore.listInvitations(workspaceId),
    decisionStore.query(workspaceId, { from: periodStart, to: periodEnd, page: 1, pageSize: 1 }),
    decisionStore.query(workspaceId, { from: periodStart, to: periodEnd, serv: true, page: 1, pageSize: 1 }),
  ]);
  const pendingInvitations = invitations.filter((invite) => invite.status === "pending" && invite.expiresAt > now.toISOString()).length;
  return {
    periodStart,
    periodEnd,
    activeProjects: projects.length,
    activeMembers: members.length,
    pendingInvitations,
    reservedSeats: members.length + pendingInvitations,
    decisions: decisions.total,
    servEvaluations: serv.total,
  };
}

export async function getCommercialSnapshot(workspaceId: string, now = new Date()) {
  const { store: planStore, persistence } = getWorkspacePlanStore();
  const [planRecord, usage] = await Promise.all([planStore.get(workspaceId), getWorkspaceCommercialUsage(workspaceId, now)]);
  const plan = getCommercialPlan(planRecord.planId);
  const meters: UsageMeter[] = [
    { key: "projects", label: "Active projects", current: usage.activeProjects, limit: plan.limits.projects, state: usageState(usage.activeProjects, plan.limits.projects) },
    { key: "members", label: "Members + pending invites", current: usage.reservedSeats, limit: plan.limits.members, state: usageState(usage.reservedSeats, plan.limits.members) },
    { key: "decisionsPerMonth", label: "Decisions this month", current: usage.decisions, limit: plan.limits.decisionsPerMonth, state: usageState(usage.decisions, plan.limits.decisionsPerMonth) },
    { key: "servEvaluationsPerMonth", label: "SERV-assisted decisions", current: usage.servEvaluations, limit: plan.limits.servEvaluationsPerMonth, state: usageState(usage.servEvaluations, plan.limits.servEvaluationsPerMonth) },
  ];
  return { planRecord, plan, usage, meters, persistence };
}

export async function assertWorkspaceEntitlement(workspaceId: string, metric: CommercialLimitKey, increment = 1) {
  const snapshot = await getCommercialSnapshot(workspaceId);
  const meter = snapshot.meters.find((item) => item.key === metric);
  if (!meter) throw new Error(`Unknown entitlement meter: ${metric}`);
  if (!canConsume(meter.current, increment, meter.limit)) {
    throw new EntitlementLimitError(snapshot.plan.id, metric, meter.current, meter.limit as number);
  }
  return snapshot;
}

export function entitlementErrorBody(error: EntitlementLimitError) {
  return {
    error: {
      code: "PLAN_LIMIT_REACHED",
      message: `The ${error.planId} plan has reached its ${error.metric} limit. Review usage or move to a plan with more capacity.`,
      planId: error.planId,
      metric: error.metric,
      current: error.current,
      limit: error.limit,
      pricingPath: "/pricing",
      billingPath: "/dashboard/billing",
    },
  };
}

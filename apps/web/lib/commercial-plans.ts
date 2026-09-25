export type CommercialPlanId = "developer" | "team" | "scale";
export type CommercialLimitKey = "projects" | "members" | "decisionsPerMonth" | "servEvaluationsPerMonth";
export type CommercialLimit = number | null;

export type CommercialPlan = {
  id: CommercialPlanId;
  name: string;
  audience: string;
  priceLabel: string;
  billingNote: string;
  limits: Record<CommercialLimitKey, CommercialLimit>;
  features: string[];
};

export type UsageState = "ok" | "warning" | "limit" | "unlimited";

export const COMMERCIAL_PLANS: Record<CommercialPlanId, CommercialPlan> = {
  developer: {
    id: "developer",
    name: "Developer",
    audience: "Individual builders and small agent projects getting governed execution into production.",
    priceLabel: "$0 / workspace / month",
    billingNote: "No payment method required.",
    limits: { projects: 3, members: 5, decisionsPerMonth: 5_000, servEvaluationsPerMonth: null },
    features: ["Policy Studio, Human Review, Decision Receipts", "GitHub and Developer API integration", "Real usage visibility and server-enforced capacity"],
  },
  team: {
    id: "team",
    name: "Team",
    audience: "Teams operating multiple governed agents and shared production review workflows.",
    priceLabel: "$49 / workspace / month",
    billingNote: "Published pricing; paid checkout is not enabled until a real billing provider is connected.",
    limits: { projects: 20, members: 25, decisionsPerMonth: 50_000, servEvaluationsPerMonth: null },
    features: ["Everything in Developer", "Higher project, seat, and monthly decision capacity", "Shared review, audit, notification, and integration operations"],
  },
  scale: {
    id: "scale",
    name: "Scale",
    audience: "Organizations that need negotiated capacity across many agents, projects, and teams.",
    priceLabel: "Custom",
    billingNote: "Sales-assisted activation only; there is no simulated enterprise checkout.",
    limits: { projects: null, members: null, decisionsPerMonth: null, servEvaluationsPerMonth: null },
    features: ["Everything in Team", "Custom capacity instead of fixed workspace limits", "Commercial terms established before plan activation"],
  },
};

export const COMMERCIAL_PLAN_ORDER: CommercialPlanId[] = ["developer", "team", "scale"];

export function getCommercialPlan(id: CommercialPlanId) {
  return COMMERCIAL_PLANS[id];
}

export function formatCommercialLimit(limit: CommercialLimit) {
  return limit === null ? "Unlimited" : new Intl.NumberFormat("en-US").format(limit);
}

export function usageState(current: number, limit: CommercialLimit): UsageState {
  if (limit === null) return "unlimited";
  if (current >= limit) return "limit";
  if (limit > 0 && current / limit >= 0.8) return "warning";
  return "ok";
}

export function canConsume(current: number, increment: number, limit: CommercialLimit) {
  if (limit === null) return true;
  return current + Math.max(0, increment) <= limit;
}

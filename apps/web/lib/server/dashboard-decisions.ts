import type { DecisionReceipt } from "@vetolayer/core";
import { dashboardDecisions, type DashboardDecision } from "../dashboard-data";
import { getDecisionStore } from "./decision-store";
import { readServerEnvironment } from "./env";

export type DashboardDataMode = "live" | "demo" | "empty";

export type DashboardDecisionFeed = {
  decisions: DashboardDecision[];
  mode: DashboardDataMode;
  persistence: "supabase" | "memory";
};

export async function loadDashboardDecisionFeed(limit = 100): Promise<DashboardDecisionFeed> {
  const explicitMode = process.env.VETOLAYER_DASHBOARD_MODE?.trim().toLowerCase();
  const environment = readServerEnvironment();
  const { store, persistence } = getDecisionStore();

  if (explicitMode === "demo") {
    return {
      decisions: dashboardDecisions.slice(0, limit),
      mode: "demo",
      persistence,
    };
  }

  if (persistence === "supabase") {
    const records = await store.list(environment.demoWorkspaceId, limit);
    if (records.length > 0) {
      return {
        decisions: records.map((record) => presentReceipt(record.receipt)),
        mode: "live",
        persistence,
      };
    }

    return { decisions: [], mode: "empty", persistence };
  }

  if (process.env.NODE_ENV !== "production") {
    return {
      decisions: dashboardDecisions.slice(0, limit),
      mode: "demo",
      persistence,
    };
  }

  return { decisions: [], mode: "empty", persistence };
}

export async function loadDashboardDecision(id: string): Promise<DashboardDecision | undefined> {
  const explicitMode = process.env.VETOLAYER_DASHBOARD_MODE?.trim().toLowerCase();
  const seeded = dashboardDecisions.find(
    (decision) => decision.receiptId === id || decision.decisionId === id,
  );

  if (explicitMode === "demo") return seeded;

  const environment = readServerEnvironment();
  const { store, persistence } = getDecisionStore();

  if (persistence === "supabase") {
    const direct = await store.get(environment.demoWorkspaceId, id);
    if (direct) return presentReceipt(direct.receipt);

    const recent = await store.list(environment.demoWorkspaceId, 200);
    const byDecisionId = recent.find((record) => record.receipt.decisionId === id);
    if (byDecisionId) return presentReceipt(byDecisionId.receipt);
  }

  if (process.env.NODE_ENV !== "production") return seeded;
  return undefined;
}

export function presentReceipt(receipt: DecisionReceipt): DashboardDecision {
  const targetLabel = receipt.action.targetId ?? receipt.action.targetType;

  return {
    ...receipt,
    display: {
      title: `${humanize(receipt.action.operation)} — ${targetLabel}`,
      repository: targetLabel,
      relativeTime: formatRelativeTime(receipt.timestamps.decidedAt),
    },
  };
}

function humanize(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRelativeTime(iso: string) {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "recently";

  const deltaMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

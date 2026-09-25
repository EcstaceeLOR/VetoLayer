import { NextResponse } from "next/server";
import type { OnboardingIntegrationChoice, OnboardingState, OnboardingUseCase } from "../../../lib/onboarding-model";
import { loadOnboardingSnapshot } from "../../../lib/server/onboarding-progress";
import { getOnboardingStore } from "../../../lib/server/onboarding-store";
import { isReliabilityTestMode } from "../../../lib/server/reliability-mode";
import { getAuthenticatedIdentity } from "../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../lib/server/workspace-store";

export const runtime = "nodejs";

function requiresDurablePersistence(persistence: "supabase" | "memory") {
  return process.env.NODE_ENV === "production" && persistence !== "supabase" && !isReliabilityTestMode();
}

export async function GET() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue onboarding." } }, { status: 401 });
  }

  try {
    const snapshot = await loadOnboardingSnapshot();
    return NextResponse.json({ snapshot });
  } catch {
    return NextResponse.json({ error: { code: "ONBOARDING_UNAVAILABLE", message: "Onboarding status could not be loaded safely." } }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue onboarding." } }, { status: 401 });
  }

  const { store, persistence } = getOnboardingStore();
  if (requiresDurablePersistence(persistence)) {
    return NextResponse.json({ error: { code: "ONBOARDING_PERSISTENCE_REQUIRED", message: "Configure Supabase persistence before using production onboarding." } }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 });
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: { code: "INVALID_ONBOARDING_STATE", message: "Onboarding state must be an object." } }, { status: 400 });
  }

  const payload = raw as Record<string, unknown>;
  const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : undefined;
  const projectId = typeof payload.projectId === "string" ? payload.projectId : undefined;
  const environmentId = typeof payload.environmentId === "string" ? payload.environmentId : undefined;
  const useCase = isUseCase(payload.useCase) ? payload.useCase : undefined;
  const integrationChoice = isIntegration(payload.integrationChoice) ? payload.integrationChoice : undefined;
  const lastStep = typeof payload.lastStep === "number" && Number.isInteger(payload.lastStep)
    ? Math.max(1, Math.min(8, payload.lastStep))
    : undefined;

  if (payload.useCase !== undefined && !useCase) {
    return NextResponse.json({ error: { code: "INVALID_USE_CASE", message: "Choose a supported onboarding use case." } }, { status: 400 });
  }
  if (payload.integrationChoice !== undefined && !integrationChoice) {
    return NextResponse.json({ error: { code: "INVALID_INTEGRATION", message: "Choose GitHub or Developer API." } }, { status: 400 });
  }

  const current = await store.get(identity.userId) ?? { updatedAt: new Date(0).toISOString() };
  const next: OnboardingState = { ...current, updatedAt: new Date().toISOString() };
  const workspaceStore = getWorkspaceStore().store;

  if (workspaceId !== undefined) {
    const [workspace, membership] = await Promise.all([
      workspaceStore.getWorkspace(workspaceId),
      workspaceStore.getMembership(workspaceId, identity.userId),
    ]);
    if (!workspace || workspace.status !== "active" || !membership) {
      return NextResponse.json({ error: { code: "WORKSPACE_FORBIDDEN", message: "That workspace is not available to this account." } }, { status: 403 });
    }
    if (next.workspaceId !== workspaceId) {
      next.workspaceId = workspaceId;
      delete next.projectId;
      delete next.environmentId;
      delete next.integrationChoice;
      delete next.policyIds;
      delete next.receiptId;
      delete next.completedAt;
    }
  }

  const effectiveWorkspaceId = workspaceId ?? next.workspaceId;
  if (projectId !== undefined) {
    if (!effectiveWorkspaceId) {
      return NextResponse.json({ error: { code: "WORKSPACE_REQUIRED", message: "Select a workspace before choosing a project." } }, { status: 409 });
    }
    const project = await workspaceStore.getProject(effectiveWorkspaceId, projectId);
    if (!project || project.status !== "active") {
      return NextResponse.json({ error: { code: "PROJECT_NOT_FOUND", message: "Choose an active project in the selected workspace." } }, { status: 404 });
    }
    if (next.projectId !== projectId) {
      next.projectId = projectId;
      delete next.environmentId;
      delete next.integrationChoice;
      delete next.policyIds;
      delete next.receiptId;
      delete next.completedAt;
    }
  }

  const effectiveProjectId = projectId ?? next.projectId;
  if (environmentId !== undefined) {
    if (!effectiveWorkspaceId || !effectiveProjectId) {
      return NextResponse.json({ error: { code: "PROJECT_REQUIRED", message: "Select a workspace and project before choosing an environment." } }, { status: 409 });
    }
    const environment = await workspaceStore.getEnvironment(effectiveWorkspaceId, effectiveProjectId, environmentId);
    if (!environment || environment.status !== "active") {
      return NextResponse.json({ error: { code: "ENVIRONMENT_NOT_FOUND", message: "Choose an active environment in the selected project." } }, { status: 404 });
    }
    if (next.environmentId !== environmentId) {
      next.environmentId = environmentId;
      delete next.policyIds;
      delete next.receiptId;
      delete next.completedAt;
    }
  }

  if (useCase !== undefined && next.useCase !== useCase) {
    next.useCase = useCase;
    delete next.policyIds;
    delete next.receiptId;
    delete next.completedAt;
  }
  if (integrationChoice !== undefined && next.integrationChoice !== integrationChoice) {
    next.integrationChoice = integrationChoice;
    delete next.receiptId;
    delete next.completedAt;
  }
  if (lastStep !== undefined) next.lastStep = lastStep;

  await store.save(identity.userId, next);
  const snapshot = await loadOnboardingSnapshot();
  return NextResponse.json({ snapshot, persistence });
}

export async function DELETE() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to restart onboarding." } }, { status: 401 });
  }
  const { store, persistence } = getOnboardingStore();
  if (requiresDurablePersistence(persistence)) {
    return NextResponse.json({ error: { code: "ONBOARDING_PERSISTENCE_REQUIRED", message: "Configure Supabase persistence before using production onboarding." } }, { status: 503 });
  }
  await store.clear(identity.userId);
  const snapshot = await loadOnboardingSnapshot();
  return NextResponse.json({ snapshot, restarted: true });
}

function isUseCase(value: unknown): value is OnboardingUseCase {
  return value === "coding" || value === "support" || value === "finance";
}

function isIntegration(value: unknown): value is OnboardingIntegrationChoice {
  return value === "github" || value === "developer-api";
}

import { createDecisionReceipt, evaluateAction } from "@vetolayer/core";
import { evaluateDeterministicPolicies } from "@vetolayer/policies";
import { evaluateWithServ, readServEnvironment } from "@vetolayer/serv";
import { NextResponse } from "next/server";
import { buildOnboardingTestInput } from "../../../../lib/onboarding-policies";
import type { OnboardingIntegrationChoice, OnboardingUseCase } from "../../../../lib/onboarding-model";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../lib/server/api-auth";
import { getDecisionStore } from "../../../../lib/server/decision-store";
import { readServerEnvironment } from "../../../../lib/server/env";
import { getIntegrationStore } from "../../../../lib/server/integration-store";
import { logServerEvent } from "../../../../lib/server/observability";
import { loadOnboardingSnapshot } from "../../../../lib/server/onboarding-progress";
import { getOnboardingStore } from "../../../../lib/server/onboarding-store";
import { getOptionalPolicyStore } from "../../../../lib/server/policy-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("policies.read");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  const { store: onboardingStore } = getOnboardingStore();
  const state = await onboardingStore.get(auth.workspace.userId);
  if (!state || !scopeMatches(state, auth.workspace)) {
    return NextResponse.json({
      error: { code: "ONBOARDING_SCOPE_MISMATCH", message: "Return to onboarding and confirm the current workspace, project, and environment first." },
    }, { status: 409 });
  }
  if (!isUseCase(state.useCase) || !isIntegration(state.integrationChoice)) {
    return NextResponse.json({ error: { code: "ONBOARDING_SETUP_INCOMPLETE", message: "Choose a use case and verify an integration before running the test action." } }, { status: 409 });
  }

  const { store: integrationStore } = getIntegrationStore();
  const connections = await integrationStore.list(auth.workspace.workspaceId, {
    projectId: auth.workspace.projectId,
    environmentId: auth.workspace.environmentId,
  });
  const connection = connections.find((candidate) => candidate.integration === state.integrationChoice);
  if (!connection || connection.state === "needs-config") {
    return NextResponse.json({ error: { code: "INTEGRATION_NOT_READY", message: "Verify the selected integration successfully before running a test action." } }, { status: 409 });
  }

  const environment = readServerEnvironment();
  if (!environment.servConfigured) {
    return NextResponse.json({
      error: {
        code: "SERV_NOT_CONFIGURED",
        message: "SERV contextual reasoning is not configured. Set SERV_API_KEY and SERV_MODEL, redeploy, then recheck readiness.",
      },
    }, { status: 409 });
  }

  const policyStore = getOptionalPolicyStore();
  if (!policyStore || !state.policyIds?.length) {
    return NextResponse.json({ error: { code: "POLICY_PACK_REQUIRED", message: "Persist a policy pack before running the test action." } }, { status: 409 });
  }
  const storedPolicies = await policyStore.list(auth.workspace.workspaceId, {
    projectId: auth.workspace.projectId,
    environmentId: auth.workspace.environmentId,
  });
  const selectedPolicies = storedPolicies
    .filter(({ policy }) => state.policyIds?.includes(policy.id))
    .map(({ policy }) => policy);
  if (selectedPolicies.length !== state.policyIds.length) {
    return NextResponse.json({ error: { code: "POLICY_PACK_STALE", message: "One or more onboarding policies no longer exist in this scope. Re-select the policy pack." } }, { status: 409 });
  }
  if (!selectedPolicies.some((policy) => policy.mode === "contextual")) {
    return NextResponse.json({ error: { code: "CONTEXTUAL_POLICY_REQUIRED", message: "Select at least one contextual policy so onboarding can verify the live SERV reasoning path." } }, { status: 409 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 });
  }
  const payload = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const target = typeof payload.target === "string" ? payload.target.trim().slice(0, 160) : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 600) : "";
  if (target.length < 2 || reason.length < 8) {
    return NextResponse.json({ error: { code: "TEST_INPUT_REQUIRED", message: "Provide a target and a short reason describing the action you want VetoLayer to evaluate." } }, { status: 400 });
  }

  const now = new Date();
  const input = buildOnboardingTestInput({
    useCase: state.useCase,
    integration: state.integrationChoice,
    environmentName: auth.workspace.environment.name,
    target,
    reason,
    now,
  });
  const decisionId = `decision_${input.action.id}`;
  const receiptId = `receipt_${input.action.id}`;

  try {
    const orchestration = await evaluateAction({
      action: input.action,
      policies: selectedPolicies,
      evidence: input.evidence,
      facts: input.facts,
      environment: {
        workspaceId: auth.workspace.workspaceId,
        workspaceName: auth.workspace.workspace.name,
        projectId: auth.workspace.projectId,
        projectName: auth.workspace.project.name,
        environmentId: auth.workspace.environmentId,
        environmentName: auth.workspace.environment.name,
        integration: state.integrationChoice,
        onboarding: true,
      },
      now,
      decisionId,
    }, {
      evaluateDeterministic: (evaluation) => evaluateDeterministicPolicies(evaluation),
      evaluateContextual: (evaluation) => evaluateWithServ(evaluation, readServEnvironment()),
    });

    const receipt = await createDecisionReceipt({
      orchestration,
      action: input.action,
      policies: selectedPolicies,
      evidence: input.evidence,
      createdAt: now,
      receiptId,
      scope: {
        workspaceId: auth.workspace.workspaceId,
        projectId: auth.workspace.projectId,
        environmentId: auth.workspace.environmentId,
        workspaceName: auth.workspace.workspace.name,
        projectName: auth.workspace.project.name,
        environmentName: auth.workspace.environment.name,
      },
    });

    const { store: decisionStore, persistence } = getDecisionStore();
    await decisionStore.save({
      id: receipt.receiptId,
      workspaceId: auth.workspace.workspaceId,
      projectId: auth.workspace.projectId,
      environmentId: auth.workspace.environmentId,
      source: "api",
      receipt,
      createdAt: receipt.timestamps.receiptCreatedAt,
    });

    const servVerified = orchestration.contextualTrace?.providerStatus === "ok";
    logServerEvent(servVerified ? "info" : "warn", "onboarding.evaluation.completed", {
      workspaceId: auth.workspace.workspaceId,
      projectId: auth.workspace.projectId,
      environmentId: auth.workspace.environmentId,
      integration: state.integrationChoice,
      outcome: receipt.outcome,
      receiptId: receipt.receiptId,
      providerStatus: orchestration.contextualTrace?.providerStatus,
    });

    if (!servVerified) {
      return NextResponse.json({
        error: {
          code: "SERV_LIVE_CHECK_FAILED",
          message: "The action was evaluated safely, but SERV did not return a validated live reasoning result. Check SERV credentials/model/network and retry.",
        },
        receipt,
        persistence,
        servVerified: false,
      }, { status: 502 });
    }

    const completedAt = new Date().toISOString();
    await onboardingStore.save(auth.workspace.userId, {
      ...state,
      receiptId: receipt.receiptId,
      lastStep: 8,
      completedAt,
      updatedAt: completedAt,
    });
    const snapshot = await loadOnboardingSnapshot();
    return NextResponse.json({ receipt, snapshot, persistence, servVerified: true });
  } catch (error) {
    logServerEvent("error", "onboarding.evaluation.failed", {
      workspaceId: auth.workspace.workspaceId,
      projectId: auth.workspace.projectId,
      environmentId: auth.workspace.environmentId,
      message: error instanceof Error ? error.message : "Onboarding evaluation failed",
    });
    return NextResponse.json({ error: { code: "ONBOARDING_EVALUATION_FAILED", message: "VetoLayer could not complete the onboarding evaluation. No action was approved." } }, { status: 503 });
  }
}

function scopeMatches(
  state: { workspaceId?: string; projectId?: string; environmentId?: string },
  workspace: { workspaceId: string; projectId: string; environmentId: string },
) {
  return state.workspaceId === workspace.workspaceId
    && state.projectId === workspace.projectId
    && state.environmentId === workspace.environmentId;
}

function isUseCase(value: unknown): value is OnboardingUseCase {
  return value === "coding" || value === "support" || value === "finance";
}

function isIntegration(value: unknown): value is OnboardingIntegrationChoice {
  return value === "github" || value === "developer-api";
}

import { NextResponse } from "next/server";
import { buildOnboardingPolicyPack } from "../../../../lib/onboarding-policies";
import type { OnboardingUseCase } from "../../../../lib/onboarding-model";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../lib/server/api-auth";
import { loadOnboardingSnapshot } from "../../../../lib/server/onboarding-progress";
import { getOnboardingStore } from "../../../../lib/server/onboarding-store";
import { getOptionalPolicyStore } from "../../../../lib/server/policy-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("policies.write");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  const policyStore = getOptionalPolicyStore();
  if (!policyStore) {
    return NextResponse.json({
      error: {
        code: "POLICY_PERSISTENCE_REQUIRED",
        message: "Configure Supabase persistence before installing an onboarding policy pack.",
      },
    }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 });
  }
  const payload = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const action = payload.action === "select-existing" ? "select-existing" : "install-starter";

  const { store: onboardingStore } = getOnboardingStore();
  const state = await onboardingStore.get(auth.workspace.userId);
  if (!state || state.workspaceId !== auth.workspace.workspaceId || state.projectId !== auth.workspace.projectId || state.environmentId !== auth.workspace.environmentId) {
    return NextResponse.json({
      error: { code: "ONBOARDING_SCOPE_MISMATCH", message: "Return to onboarding and confirm the current workspace, project, and environment first." },
    }, { status: 409 });
  }
  if (!isUseCase(state.useCase)) {
    return NextResponse.json({ error: { code: "USE_CASE_REQUIRED", message: "Choose an onboarding use case before selecting policies." } }, { status: 409 });
  }

  let policyIds: string[];
  if (action === "select-existing") {
    const requested = Array.isArray(payload.policyIds)
      ? payload.policyIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim())
      : [];
    if (!requested.length) {
      return NextResponse.json({ error: { code: "POLICY_REQUIRED", message: "Select at least one persisted policy." } }, { status: 400 });
    }
    const existing = await policyStore.list(auth.workspace.workspaceId, {
      projectId: auth.workspace.projectId,
      environmentId: auth.workspace.environmentId,
    });
    const byId = new Map(existing.map(({ policy }) => [policy.id, policy] as const));
    if (!requested.every((id) => byId.has(id))) {
      return NextResponse.json({ error: { code: "POLICY_NOT_FOUND", message: "One or more selected policies are not persisted in this project and environment." } }, { status: 404 });
    }
    const selected = requested.map((id) => byId.get(id)!);
    if (!selected.some((policy) => policy.mode === "contextual")) {
      return NextResponse.json({
        error: {
          code: "CONTEXTUAL_POLICY_REQUIRED",
          message: "Select at least one contextual policy so onboarding can verify the live SERV reasoning path.",
        },
      }, { status: 409 });
    }
    policyIds = [...new Set(requested)];
  } else {
    const policies = buildOnboardingPolicyPack(state.useCase, auth.workspace.environment.name);
    const updatedAt = new Date().toISOString();
    for (const policy of policies) {
      await policyStore.save({
        workspaceId: auth.workspace.workspaceId,
        projectId: auth.workspace.projectId,
        environmentId: auth.workspace.environmentId,
        policy,
        updatedAt,
      });
    }
    policyIds = policies.map((policy) => policy.id);
  }

  await onboardingStore.save(auth.workspace.userId, {
    ...state,
    policyIds,
    lastStep: 6,
    updatedAt: new Date().toISOString(),
  });

  const snapshot = await loadOnboardingSnapshot();
  return NextResponse.json({ policyIds, snapshot });
}

function isUseCase(value: unknown): value is OnboardingUseCase {
  return value === "coding" || value === "support" || value === "finance";
}

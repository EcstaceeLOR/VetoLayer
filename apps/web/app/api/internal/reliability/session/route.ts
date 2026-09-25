import { NextResponse } from "next/server";
import {
  FLAGSHIP_INCIDENT,
  FLAGSHIP_REVIEW_CASE_ID,
  createFlagshipHumanReview,
  flagshipSnapshot,
  runFlagshipScenario,
} from "../../../../../lib/flagship-scenario";
import { policyStudioTemplates } from "../../../../../lib/policy-lifecycle";
import { getDeveloperStore } from "../../../../../lib/server/developer-store";
import { getPolicyLifecycleStore } from "../../../../../lib/server/policy-lifecycle-store";
import { reevaluateReviewCase } from "../../../../../lib/server/review-workflow";
import {
  ENVIRONMENT_COOKIE,
  PROJECT_COOKIE,
  WORKSPACE_COOKIE,
} from "../../../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../../../lib/server/workspace-store";
import {
  isReliabilityTestMode,
  normalizeReliabilityProfile,
  RELIABILITY_PROFILE_COOKIE,
  reliabilityIdentity,
} from "../../../../../lib/server/reliability-mode";

export const runtime = "nodejs";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false,
  path: "/",
  maxAge: 60 * 60,
};

export async function GET(request: Request) {
  if (!isReliabilityTestMode()) return notFound();

  const url = new URL(request.url);
  const profile = normalizeReliabilityProfile(url.searchParams.get("profile"));
  const response = NextResponse.json({ ok: true, profile });
  response.cookies.set(RELIABILITY_PROFILE_COOKIE, profile, cookieOptions);

  if (profile === "onboarding") {
    for (const name of [WORKSPACE_COOKIE, PROJECT_COOKIE, ENVIRONMENT_COOKIE]) {
      response.cookies.set(name, "", { ...cookieOptions, maxAge: 0 });
    }
    return response;
  }

  const scope = await ensureOperatorScope();
  response.cookies.set(WORKSPACE_COOKIE, scope.workspaceId, cookieOptions);
  response.cookies.set(PROJECT_COOKIE, scope.projectId, cookieOptions);
  response.cookies.set(ENVIRONMENT_COOKIE, scope.environmentId, cookieOptions);
  return response;
}

export async function POST(request: Request) {
  if (!isReliabilityTestMode()) return notFound();
  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  } catch {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const scope = await ensureOperatorScope();
  const identity = reliabilityIdentity("operator");
  const action = String(body.action ?? "");

  if (action === "create_key") {
    const { store } = getDeveloperStore();
    const created = await store.createApiKey({
      ...scope,
      name: "Browser reliability key",
      permissions: ["evaluate", "read:decisions"],
      createdByUserId: identity.userId,
    });
    return NextResponse.json({ key: { id: created.record.id, name: created.record.name, keyPrefix: created.record.keyPrefix }, secret: created.secret }, { status: 201 });
  }

  if (action === "revoke_key") {
    const id = String(body.id ?? "");
    const { store } = getDeveloperStore();
    const record = id ? await store.getApiKey(scope, id) : null;
    if (!record) return NextResponse.json({ error: { code: "API_KEY_NOT_FOUND", message: "Reliability API key not found." } }, { status: 404 });
    await store.revokeApiKey(scope, id);
    return NextResponse.json({ ok: true });
  }

  if (action === "create_policy") {
    const template = policyStudioTemplates.find((candidate) => candidate.policy.mode === "contextual") ?? policyStudioTemplates[0];
    if (!template) throw new Error("Policy Studio has no templates available for reliability testing.");
    const { store } = getPolicyLifecycleStore();
    const created = await store.createInitialDraft({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      policy: { ...template.policy, enabled: false },
      targetEnvironmentIds: [scope.environmentId],
      sourceTemplateId: template.id,
      changeNote: "Browser reliability policy fixture",
      createdByUserId: identity.userId,
    });
    return NextResponse.json({
      version: created,
      requestPolicy: { ...created.policy, enabled: true },
    }, { status: 201 });
  }

  if (action === "review_journey") {
    const now = new Date();
    const initial = await runFlagshipScenario("needs-approval", { now });
    if (initial.receipt.outcome !== "REVIEW") {
      return NextResponse.json({ error: { code: "RELIABILITY_REVIEW_NOT_REQUIRED", message: "Reliability review fixture did not produce REVIEW." } }, { status: 500 });
    }
    const humanReview = createFlagshipHumanReview(new Date(now.getTime() + 1_000));
    const reviewCase = {
      id: FLAGSHIP_REVIEW_CASE_ID,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      environmentId: scope.environmentId,
      revision: 1,
      status: "pending" as const,
      title: "Production review reliability check",
      source: "integration" as const,
      receipt: initial.receipt,
      context: {
        kind: "github" as const,
        snapshot: flagshipSnapshot("needs-approval"),
        operation: "deploy-production" as const,
        restrictedWindow: true,
        incident: FLAGSHIP_INCIDENT,
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      comments: [],
      evidenceAdditions: [],
      reviewHistory: [humanReview],
      timeline: [],
      receiptLineage: [{
        receiptId: initial.receipt.receiptId,
        outcome: initial.receipt.outcome,
        createdAt: initial.receipt.timestamps.receiptCreatedAt,
        reason: "initial" as const,
      }],
      review: humanReview,
    };
    const reevaluated = await reevaluateReviewCase({
      reviewCase,
      scope,
      receiptScope: {
        ...scope,
        workspaceName: "Reliability Workspace",
        projectName: "Production Gate",
        environmentName: "Production",
      },
      humanReview,
      reason: "approval",
    });
    return NextResponse.json({
      initialReceiptId: initial.receipt.receiptId,
      initialOutcome: initial.receipt.outcome,
      resolutionReceiptId: reevaluated.receipt.receiptId,
      resolutionOutcome: reevaluated.receipt.outcome,
      parentReceiptId: reevaluated.parentReceiptId,
    });
  }

  return NextResponse.json({ error: { code: "UNKNOWN_ACTION", message: "Unknown reliability fixture action." } }, { status: 400 });
}

async function ensureOperatorScope() {
  const identity = reliabilityIdentity("operator");
  const { store } = getWorkspaceStore();
  const existing = (await store.listWorkspacesForUser(identity.userId))
    .find(({ workspace }) => workspace.status === "active");

  let workspace;
  let project;
  let environments;
  if (existing) {
    workspace = existing.workspace;
    const projects = await store.listProjects(workspace.id);
    project = projects.find((candidate) => candidate.status === "active") ?? projects[0];
    if (!project) throw new Error("Reliability workspace has no project.");
    environments = await store.listEnvironments(workspace.id, project.id);
  } else {
    const graph = await store.createWorkspace({
      ownerUserId: identity.userId,
      ownerEmail: identity.email,
      ownerDisplayName: identity.displayName,
      workspaceName: "Reliability Workspace",
      projectName: "Production Gate",
      legacyWorkspaceId: `user:${identity.userId}`,
    });
    workspace = graph.workspace;
    project = graph.project;
    environments = graph.environments;
  }

  const environment = environments.find((candidate) => candidate.kind === "production") ?? environments[0];
  if (!environment) throw new Error("Reliability project has no environment.");
  return { workspaceId: workspace.id, projectId: project.id, environmentId: environment.id };
}

function notFound() {
  return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
}

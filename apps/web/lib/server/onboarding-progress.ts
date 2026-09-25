import type { OnboardingSnapshot, OnboardingState, OnboardingStepStatus } from "../onboarding-model";
import { readServerEnvironment } from "./env";
import { getDecisionStore } from "./decision-store";
import { getIntegrationStore } from "./integration-store";
import { getOnboardingStore } from "./onboarding-store";
import { getOptionalPolicyStore } from "./policy-store";
import { getAuthenticatedIdentity, getAuthenticatedWorkspace } from "./workspace";
import { getWorkspaceStore } from "./workspace-store";

export type OnboardingValidation = {
  workspace: boolean;
  project: boolean;
  environment: boolean;
  integration: boolean;
  policy: boolean;
  serv: boolean;
  test: boolean;
  receipt: boolean;
  details?: Partial<Record<OnboardingStepStatus["key"], string>>;
};

export function buildOnboardingSteps(validation: OnboardingValidation): OnboardingStepStatus[] {
  const details = validation.details ?? {};
  return [
    { id: 1, key: "workspace", label: "Workspace", complete: validation.workspace, detail: details.workspace ?? (validation.workspace ? "Active workspace selected." : "Create or select an active workspace.") },
    { id: 2, key: "project", label: "Project", complete: validation.project, detail: details.project ?? (validation.project ? "Active project selected." : "Create or select an active project.") },
    { id: 3, key: "environment", label: "Environment", complete: validation.environment, detail: details.environment ?? (validation.environment ? "Target environment and use case selected." : "Choose an environment and use case.") },
    { id: 4, key: "integration", label: "Integration", complete: validation.integration, detail: details.integration ?? (validation.integration ? "Integration readiness verified." : "Connect GitHub or verify the Developer API.") },
    { id: 5, key: "policy", label: "Policy", complete: validation.policy, detail: details.policy ?? (validation.policy ? "Starter policy pack is persisted." : "Create or select a persisted policy pack.") },
    { id: 6, key: "serv", label: "SERV", complete: validation.serv, detail: details.serv ?? (validation.serv ? "SERV contextual reasoning is configured." : "Configure SERV_API_KEY and SERV_MODEL.") },
    { id: 7, key: "test", label: "Test action", complete: validation.test, detail: details.test ?? (validation.test ? "A real scoped evaluation has completed." : "Run an evaluated test action through the real pipeline.") },
    { id: 8, key: "receipt", label: "Receipt", complete: validation.receipt, detail: details.receipt ?? (validation.receipt ? "A persisted Decision Receipt is available." : "Complete a test action to inspect its Decision Receipt.") },
  ];
}

export function resolveOnboardingResumeStep(
  steps: OnboardingStepStatus[],
  lastStep?: number,
  complete = false,
) {
  if (complete) return 8;
  const firstIncomplete = steps.find((step) => !step.complete)?.id ?? 8;
  const requested = Math.max(1, Math.min(8, Math.trunc(lastStep ?? firstIncomplete)));
  const earlierStepsComplete = steps
    .filter((step) => step.id < requested)
    .every((step) => step.complete);
  return earlierStepsComplete ? requested : firstIncomplete;
}

export async function loadOnboardingSnapshot(): Promise<OnboardingSnapshot | null> {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return null;

  const { store: onboardingStore, persistence } = getOnboardingStore();
  const storedState = await onboardingStore.get(identity.userId);
  const state: OnboardingState = storedState ?? { updatedAt: new Date(0).toISOString() };

  const { store: workspaceStore } = getWorkspaceStore();
  const memberships = (await workspaceStore.listWorkspacesForUser(identity.userId))
    .filter(({ workspace }) => workspace.status === "active");
  const current = await getAuthenticatedWorkspace();
  const currentWorkspaceId = current?.workspaceId;
  const currentProjectId = current?.projectId;
  const currentEnvironmentId = current?.environmentId;

  const selectedWorkspaceEntry =
    memberships.find(({ workspace }) => workspace.id === state.workspaceId)
    ?? (currentWorkspaceId ? memberships.find(({ workspace }) => workspace.id === currentWorkspaceId) : undefined);

  const selectedWorkspace = selectedWorkspaceEntry?.workspace;
  const projects = selectedWorkspace ? await workspaceStore.listProjects(selectedWorkspace.id) : [];
  const selectedProject =
    projects.find((project) => project.id === state.projectId)
    ?? (currentWorkspaceId === selectedWorkspace?.id && currentProjectId
      ? projects.find((project) => project.id === currentProjectId)
      : undefined);

  const environments = selectedWorkspace && selectedProject
    ? await workspaceStore.listEnvironments(selectedWorkspace.id, selectedProject.id)
    : [];
  const selectedEnvironment =
    environments.find((environment) => environment.id === state.environmentId)
    ?? (currentWorkspaceId === selectedWorkspace?.id && currentProjectId === selectedProject?.id && currentEnvironmentId
      ? environments.find((environment) => environment.id === currentEnvironmentId)
      : undefined);

  const scope = selectedWorkspace && selectedProject && selectedEnvironment
    ? { workspaceId: selectedWorkspace.id, projectId: selectedProject.id, environmentId: selectedEnvironment.id }
    : null;

  let connections: OnboardingSnapshot["connections"] = [];
  let policies: OnboardingSnapshot["policies"] = [];
  let receipt: OnboardingSnapshot["receipt"] | undefined;

  if (scope) {
    const { store: integrationStore } = getIntegrationStore();
    const storedConnections = await integrationStore.list(scope.workspaceId, {
      projectId: scope.projectId,
      environmentId: scope.environmentId,
    });
    connections = storedConnections.map((connection) => ({
      integration: connection.integration,
      state: connection.state,
      ...(connection.account ? { account: connection.account } : {}),
      ...(connection.lastCode ? { lastCode: connection.lastCode } : {}),
      updatedAt: connection.updatedAt,
    }));

    const policyStore = getOptionalPolicyStore();
    if (policyStore) {
      const storedPolicies = await policyStore.list(scope.workspaceId, {
        projectId: scope.projectId,
        environmentId: scope.environmentId,
      });
      policies = storedPolicies.map(({ policy }) => ({
        id: policy.id,
        name: policy.name,
        mode: policy.mode,
        severity: policy.severity,
      }));
    }

    if (state.receiptId) {
      const { store: decisionStore } = getDecisionStore();
      const record = await decisionStore.get(scope.workspaceId, state.receiptId);
      if (
        record
        && record.projectId === scope.projectId
        && record.environmentId === scope.environmentId
      ) {
        receipt = {
          receiptId: record.receipt.receiptId,
          decisionId: record.receipt.decisionId,
          outcome: record.receipt.outcome,
          summary: record.receipt.decisionSummary,
          createdAt: record.createdAt,
          href: `/dashboard/decisions/${encodeURIComponent(record.receipt.receiptId)}`,
        };
      }
    }
  }

  const environment = readServerEnvironment();
  const servConfigured = environment.servConfigured;
  const chosenConnection = state.integrationChoice
    ? connections.find((connection) => connection.integration === state.integrationChoice)
    : undefined;
  const expectedPolicyIds = state.policyIds ?? [];
  const existingPolicyIds = new Set(policies.map((policy) => policy.id));
  const policyComplete = expectedPolicyIds.length > 0 && expectedPolicyIds.every((id) => existingPolicyIds.has(id));
  const environmentComplete = Boolean(selectedEnvironment && state.useCase);
  const receiptComplete = Boolean(receipt);

  const steps = buildOnboardingSteps({
    workspace: Boolean(selectedWorkspace && selectedWorkspaceEntry),
    project: Boolean(selectedProject?.status === "active"),
    environment: environmentComplete,
    integration: Boolean(chosenConnection && chosenConnection.state !== "needs-config"),
    policy: policyComplete,
    serv: servConfigured,
    test: receiptComplete,
    receipt: receiptComplete,
    details: {
      ...(selectedWorkspace ? { workspace: `${selectedWorkspace.name} is active.` } : {}),
      ...(selectedProject ? { project: `${selectedProject.name} is active.` } : {}),
      ...(selectedEnvironment && state.useCase ? { environment: `${selectedEnvironment.name} · ${state.useCase} use case.` } : {}),
      ...(chosenConnection ? { integration: `${chosenConnection.integration} · ${chosenConnection.state}.` } : {}),
      ...(policyComplete ? { policy: `${expectedPolicyIds.length} persisted polic${expectedPolicyIds.length === 1 ? "y" : "ies"} selected.` } : {}),
      serv: servConfigured ? "SERV_API_KEY and SERV_MODEL are configured." : "SERV credentials are not configured on this deployment.",
      ...(receipt ? { test: `Evaluation completed with ${receipt.outcome}.`, receipt: `Decision Receipt ${receipt.receiptId} is persisted.` } : {}),
    },
  });

  const complete = steps.every((step) => step.complete);
  const resumeStep = resolveOnboardingResumeStep(steps, state.lastStep, complete);

  return {
    persistence,
    durable: persistence === "supabase",
    state,
    workspaces: memberships.map(({ workspace, membership }) => ({ workspace, role: membership.role })),
    ...(selectedWorkspace && selectedWorkspaceEntry && selectedProject && selectedEnvironment
      ? {
          selected: {
            workspace: selectedWorkspace,
            project: selectedProject,
            environment: selectedEnvironment,
            role: selectedWorkspaceEntry.membership.role,
            projects,
            environments,
          },
        }
      : {}),
    connections,
    policies,
    serv: {
      configured: servConfigured,
      modelConfigured: Boolean(process.env.SERV_MODEL?.trim()),
      message: servConfigured
        ? "SERV contextual reasoning is configured for this deployment."
        : "Set SERV_API_KEY and SERV_MODEL, then redeploy before running the onboarding evaluation.",
    },
    ...(receipt ? { receipt } : {}),
    steps,
    resumeStep,
    complete,
  };
}

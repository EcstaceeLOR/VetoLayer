import { PolicySchema } from "@vetolayer/core";
import { NextResponse } from "next/server";
import { groupPolicyVersions, policyActivationWarnings, policyStudioTemplates, type PolicyVersionRecord } from "../../../lib/policy-lifecycle";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../lib/server/api-auth";
import { recordAuditEvent, workspaceAuditInput } from "../../../lib/server/audit";
import { logServerEvent } from "../../../lib/server/observability";
import { getPolicyLifecycleStore } from "../../../lib/server/policy-lifecycle-store";
import { emitProductEvent } from "../../../lib/server/product-events";
import type { WorkspaceContext } from "../../../lib/server/workspace";

export const runtime = "nodejs";

function projectScope(workspace: { workspaceId: string; projectId: string }) { return { workspaceId: workspace.workspaceId, projectId: workspace.projectId }; }
function productError(code: string, message: string, status = 400, details?: unknown) { return NextResponse.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status }); }
function productionPersistenceRequired(persistence: "supabase" | "memory") { return process.env.NODE_ENV === "production" && persistence !== "supabase"; }
function validTargets(workspace: WorkspaceContext, value: unknown) {
  if (!Array.isArray(value)) return null;
  const requested = [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
  if (!requested.length) return null;
  const allowed = new Set(workspace.availableEnvironments.filter((environment) => environment.status === "active").map((environment) => environment.id));
  return requested.every((id) => allowed.has(id)) ? requested : null;
}

export async function GET() {
  const auth = await requireApiWorkspace("policies.read");
  if (!auth.ok) return auth.response;
  const scope = projectScope(auth.workspace);
  const { store, persistence } = getPolicyLifecycleStore();
  try {
    const versions = await store.listProjectVersions(scope);
    return NextResponse.json({
      policies: groupPolicyVersions(versions), templates: policyStudioTemplates, persistence,
      selectedEnvironmentId: auth.workspace.environmentId,
      environments: auth.workspace.availableEnvironments.filter((environment) => environment.status === "active").map((environment) => ({ id: environment.id, name: environment.name, kind: environment.kind })),
      scope: { workspaceId: auth.workspace.workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId },
    });
  } catch (error) {
    return productError("POLICY_LIFECYCLE_UNAVAILABLE", error instanceof Error ? error.message : "Policy lifecycle storage is unavailable.", 503);
  }
}

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("policies.write");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
    body = raw as Record<string, unknown>;
  } catch { return productError("INVALID_REQUEST", "Policy lifecycle request must be a JSON object."); }

  const action = String(body.action ?? "");
  const scope = projectScope(auth.workspace);
  const { store, persistence } = getPolicyLifecycleStore();
  if (productionPersistenceRequired(persistence)) return productError("POLICY_PERSISTENCE_REQUIRED", "Apply the Policy Studio lifecycle migration and configure Supabase server persistence before managing production policies.", 503);

  try {
    if (action === "create_from_template") {
      const templateId = String(body.templateId ?? "");
      const template = policyStudioTemplates.find((candidate) => candidate.id === templateId);
      if (!template) return productError("POLICY_TEMPLATE_NOT_FOUND", "Policy template not found.", 404);
      const targets = validTargets(auth.workspace, body.targetEnvironmentIds ?? [auth.workspace.environmentId]);
      if (!targets) return productError("INVALID_POLICY_TARGETS", "Select one or more active environments in this project.");
      const created = await store.createInitialDraft({ ...scope, policy: { ...template.policy, enabled: false }, targetEnvironmentIds: targets, sourceTemplateId: template.id, changeNote: `Created from ${template.name}`, createdByUserId: auth.workspace.userId });
      await auditPolicy(auth.workspace, created, "policy.create", request, { sourceTemplateId: template.id });
      return NextResponse.json({ version: created, persistence }, { status: 201 });
    }

    if (action === "create_draft") {
      const parsed = PolicySchema.safeParse(body.policy);
      if (!parsed.success) return productError("INVALID_POLICY", "Policy does not satisfy the VetoLayer contract.", 400, parsed.error.issues);
      const targets = validTargets(auth.workspace, body.targetEnvironmentIds ?? [auth.workspace.environmentId]);
      if (!targets) return productError("INVALID_POLICY_TARGETS", "Select one or more active environments in this project.");
      const created = await store.createInitialDraft({ ...scope, policy: { ...parsed.data, enabled: false }, targetEnvironmentIds: targets, changeNote: String(body.changeNote ?? "New policy draft").trim().slice(0, 500), createdByUserId: auth.workspace.userId });
      await auditPolicy(auth.workspace, created, "policy.create", request);
      return NextResponse.json({ version: created, persistence }, { status: 201 });
    }

    if (action === "save_draft") {
      const versionId = String(body.versionId ?? "");
      const parsed = PolicySchema.safeParse(body.policy);
      if (!versionId || !parsed.success) return productError("INVALID_POLICY", "A draft version and valid policy are required.", 400, parsed.success ? undefined : parsed.error.issues);
      const targets = validTargets(auth.workspace, body.targetEnvironmentIds);
      if (!targets) return productError("INVALID_POLICY_TARGETS", "Select one or more active environments in this project.");
      const updated = await store.updateDraft({ ...scope, versionId, policy: { ...parsed.data, enabled: false }, targetEnvironmentIds: targets, changeNote: String(body.changeNote ?? "").trim().slice(0, 500) });
      await auditPolicy(auth.workspace, updated, "policy.draft.update", request);
      return NextResponse.json({ version: updated, persistence });
    }

    if (action === "edit_as_new_version") {
      const sourceVersionId = String(body.versionId ?? "");
      if (!sourceVersionId) return productError("POLICY_VERSION_REQUIRED", "Select a published version to edit.");
      const created = await store.forkDraft({ ...scope, sourceVersionId, createdByUserId: auth.workspace.userId, changeNote: String(body.changeNote ?? "New draft version").trim().slice(0, 500) });
      await auditPolicy(auth.workspace, created, "policy.version.create", request, { sourceVersionId });
      return NextResponse.json({ version: created, persistence }, { status: 201 });
    }

    if (action === "duplicate_version") {
      const sourceVersionId = String(body.versionId ?? "");
      if (!sourceVersionId) return productError("POLICY_VERSION_REQUIRED", "Select a version to duplicate.");
      const duplicated = await store.duplicateVersion({ ...scope, sourceVersionId, createdByUserId: auth.workspace.userId });
      await auditPolicy(auth.workspace, duplicated, "policy.duplicate", request, { sourceVersionId });
      return NextResponse.json({ version: duplicated, persistence }, { status: 201 });
    }

    if (action === "activation_check" || action === "activate_version") {
      const versionId = String(body.versionId ?? "");
      const candidate = versionId ? await store.getVersion(scope, versionId) : null;
      if (!candidate) return productError("POLICY_VERSION_NOT_FOUND", "Policy version not found.", 404);
      if (candidate.state === "active") return NextResponse.json({ version: candidate, warnings: [], canActivate: true });
      const active = (await store.listProjectVersions(scope)).filter((version) => version.state === "active");
      const warnings = policyActivationWarnings(candidate, active);
      const blocking = warnings.filter((warning) => warning.severity === "error");
      if (action === "activation_check") return NextResponse.json({ version: candidate, warnings, canActivate: blocking.length === 0 });
      if (blocking.length) return productError("POLICY_ACTIVATION_BLOCKED", "Resolve blocking policy conflicts before activation.", 409, warnings);
      const confirmationRequired = warnings.some((warning) => warning.severity === "warning");
      if (confirmationRequired && body.confirmWarnings !== true) return productError("POLICY_ACTIVATION_CONFIRMATION_REQUIRED", "Review the policy warnings before activation.", 409, warnings);
      const activated = await store.activateVersion(scope, versionId);
      await Promise.all([
        emitPolicyLifecycleEvent(auth.workspace, activated, "policy.activated"),
        auditPolicy(auth.workspace, activated, "policy.activate", request, { warningsAcknowledged: confirmationRequired }),
      ]);
      return NextResponse.json({ version: activated, warnings, persistence });
    }

    if (action === "archive_version") {
      const versionId = String(body.versionId ?? "");
      if (!versionId) return productError("POLICY_VERSION_REQUIRED", "Select a policy version to archive.");
      const archivedVersion = await store.archiveVersion(scope, versionId);
      await Promise.all([
        emitPolicyLifecycleEvent(auth.workspace, archivedVersion, "policy.deactivated"),
        auditPolicy(auth.workspace, archivedVersion, "policy.archive", request),
      ]);
      return NextResponse.json({ version: archivedVersion, persistence });
    }

    return productError("UNKNOWN_POLICY_ACTION", "Unknown Policy Studio lifecycle action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Policy lifecycle action failed.";
    const code = message.includes("immutable") ? "POLICY_VERSION_IMMUTABLE" : message.includes("editable draft") ? "POLICY_DRAFT_EXISTS" : "POLICY_ACTION_FAILED";
    return productError(code, message, code === "POLICY_DRAFT_EXISTS" ? 409 : 503);
  }
}

async function auditPolicy(workspace: WorkspaceContext, version: PolicyVersionRecord, action: string, request: Request, extra: Record<string, unknown> = {}) {
  await recordAuditEvent(workspaceAuditInput(workspace, {
    action,
    category: "policy",
    targetType: "policy_version",
    targetId: version.id,
    targetLabel: `${version.policy.name} v${version.version}`,
    href: `/dashboard/policies?policy=${encodeURIComponent(version.policyId)}&version=${version.version}`,
    request,
    metadata: {
      policyId: version.policyId,
      version: version.version,
      state: version.state,
      severity: version.policy.severity,
      targetEnvironmentIds: version.targetEnvironmentIds,
      changeNote: version.changeNote ?? null,
      ...extra,
    },
  }));
}

async function emitPolicyLifecycleEvent(workspace: WorkspaceContext, version: PolicyVersionRecord, type: "policy.activated" | "policy.deactivated") {
  try {
    await Promise.all(version.targetEnvironmentIds.map((environmentId) => emitProductEvent({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
      environmentId,
      idempotencyKey: `policy:${version.id}:${environmentId}:${type}`,
      type,
      severity: version.policy.severity === "critical" ? "critical" : version.policy.severity === "high" ? "warning" : "info",
      title: type === "policy.activated" ? "Policy activated" : "Policy deactivated",
      message: `${version.policy.name} v${version.version} was ${type === "policy.activated" ? "activated" : "deactivated"}.`,
      href: `/dashboard/policies?policy=${encodeURIComponent(version.policyId)}&version=${version.version}`,
      actorUserId: workspace.userId,
      data: { policyId: version.policyId, version: version.version, versionId: version.id, targetEnvironmentIds: version.targetEnvironmentIds },
    })));
  } catch (error) {
    logServerEvent("warn", "policy.notification.emit_failed", { workspaceId: workspace.workspaceId, projectId: workspace.projectId, policyId: version.policyId, version: version.version, type, message: error instanceof Error ? error.message : "Policy notification failed" });
  }
}

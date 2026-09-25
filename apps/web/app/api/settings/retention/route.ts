import { NextResponse } from "next/server";
import { requireApiWorkspace } from "../../../../lib/server/api-auth";
import { recordAuditEvent, workspaceAuditInput } from "../../../../lib/server/audit";
import { applyWorkspaceRetention } from "../../../../lib/server/retention";
import {
  getWorkspaceSettingsStore,
  isRetentionTightening,
  RETENTION_DAY_OPTIONS,
  SettingsConflictError,
  type RetentionDays,
} from "../../../../lib/server/settings-store";

export const runtime = "nodejs";

const allowed = new Set<number>(RETENTION_DAY_OPTIONS);

export async function GET() {
  const auth = await requireApiWorkspace("decisions.read");
  if (!auth.ok) return auth.response;
  const { store, persistence } = getWorkspaceSettingsStore();
  const settings = await store.get(auth.workspace.workspaceId);
  return NextResponse.json({ settings, persistence }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  const auth = await requireApiWorkspace("workspace.manage");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Retention settings must be valid JSON." } }, { status: 400 });
  }

  const decisionRetentionDays = Number(body.decisionRetentionDays);
  const reviewRetentionDays = Number(body.reviewRetentionDays);
  const notificationRetentionDays = Number(body.notificationRetentionDays);
  const expectedRevision = Number(body.expectedRevision);
  if (![decisionRetentionDays, reviewRetentionDays, notificationRetentionDays].every((value) => Number.isInteger(value) && allowed.has(value))) {
    return NextResponse.json({ error: { code: "INVALID_RETENTION_WINDOW", message: "Choose one of the supported retention windows." } }, { status: 400 });
  }
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return NextResponse.json({ error: { code: "INVALID_REVISION", message: "A valid settings revision is required." } }, { status: 400 });
  }

  const { store } = getWorkspaceSettingsStore();
  const current = await store.get(auth.workspace.workspaceId);
  const next = {
    decisionRetentionDays: decisionRetentionDays as RetentionDays,
    reviewRetentionDays: reviewRetentionDays as RetentionDays,
    notificationRetentionDays: notificationRetentionDays as RetentionDays,
  };
  const tightening = isRetentionTightening(current, next);
  if (tightening && String(body.confirmation ?? "") !== "APPLY RETENTION") {
    return NextResponse.json({ error: { code: "RETENTION_CONFIRMATION_REQUIRED", message: "Type APPLY RETENTION to confirm a shorter retention period. Older operational records may be deleted immediately." } }, { status: 400 });
  }

  try {
    const settings = await store.save(auth.workspace.workspaceId, { ...next, expectedRevision, updatedByUserId: auth.workspace.userId });
    await recordAuditEvent(workspaceAuditInput(auth.workspace, {
      action: "retention.policy.update",
      category: "settings",
      targetType: "workspace_retention",
      targetId: auth.workspace.workspaceId,
      targetLabel: auth.workspace.workspace.name,
      href: "/dashboard/settings#data-retention",
      request,
      metadata: {
        previous: {
          revision: current.revision,
          decisionRetentionDays: current.decisionRetentionDays,
          reviewRetentionDays: current.reviewRetentionDays,
          notificationRetentionDays: current.notificationRetentionDays,
        },
        next: {
          revision: settings.revision,
          decisionRetentionDays: settings.decisionRetentionDays,
          reviewRetentionDays: settings.reviewRetentionDays,
          notificationRetentionDays: settings.notificationRetentionDays,
        },
        tightening,
      },
    }));

    let retention = null;
    let cleanupPending = false;
    if (tightening) {
      try {
        retention = await applyWorkspaceRetention(auth.workspace.workspaceId);
      } catch {
        cleanupPending = true;
      }
    }

    return NextResponse.json({ settings, retention, cleanupPending }, { status: cleanupPending ? 202 : 200 });
  } catch (error) {
    if (error instanceof SettingsConflictError) {
      return NextResponse.json({ error: { code: "SETTINGS_CONFLICT", message: "Retention settings changed after this page was loaded. Refresh and review the current values before saving again." }, current: error.current }, { status: 409 });
    }
    throw error;
  }
}

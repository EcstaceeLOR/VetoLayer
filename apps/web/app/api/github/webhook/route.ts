import { NextResponse } from "next/server";
import { readGitHubAppConfig, verifyGitHubWebhookSignature } from "../../../../lib/server/github-app";
import { recordGitHubWebhookEvent, refreshConnectionsForInstallation } from "../../../../lib/server/github-app-service";
import { logServerEvent } from "../../../../lib/server/observability";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let config;
  try {
    config = readGitHubAppConfig();
  } catch {
    return NextResponse.json({ error: { code: "GITHUB_APP_NOT_CONFIGURED", message: "GitHub App webhook handling is unavailable." } }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGitHubWebhookSignature({ body, signature, secret: config.webhookSecret })) {
    return NextResponse.json({ error: { code: "INVALID_SIGNATURE", message: "Webhook signature verification failed." } }, { status: 401 });
  }

  const event = request.headers.get("x-github-event")?.trim() || "unknown";
  if (event === "ping") return NextResponse.json({ ok: true, event });

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid payload");
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: { code: "INVALID_PAYLOAD", message: "Webhook payload must be valid JSON." } }, { status: 400 });
  }

  const installation = payload.installation && typeof payload.installation === "object" && !Array.isArray(payload.installation)
    ? payload.installation as { id?: unknown }
    : undefined;
  const installationId = typeof installation?.id === "number" ? installation.id : Number(installation?.id);
  if (!Number.isInteger(installationId) || installationId < 1) {
    return NextResponse.json({ ok: true, event, ignored: "no-installation" }, { status: 202 });
  }

  const action = typeof payload.action === "string" ? payload.action : "unknown";
  const eventName = `${event}:${action}`;
  try {
    if (event === "installation" && action === "deleted") {
      await recordGitHubWebhookEvent({ installationId, event: eventName, status: "uninstalled", clearRepositories: true });
    } else if (event === "installation" && action === "suspend") {
      await recordGitHubWebhookEvent({ installationId, event: eventName, status: "suspended" });
    } else if (
      event === "installation_repositories"
      || (event === "installation" && (action === "unsuspend" || action === "new_permissions_accepted"))
    ) {
      await recordGitHubWebhookEvent({ installationId, event: eventName });
      await refreshConnectionsForInstallation(installationId);
    } else if (["pull_request", "pull_request_review", "check_run", "check_suite"].includes(event)) {
      await recordGitHubWebhookEvent({ installationId, event: eventName });
    } else {
      await recordGitHubWebhookEvent({ installationId, event: eventName });
    }

    logServerEvent("info", "github.webhook.accepted", {
      event,
      action,
      installationId,
      deliveryId: request.headers.get("x-github-delivery") ?? undefined,
    });
    return NextResponse.json({ ok: true, event, action });
  } catch {
    logServerEvent("error", "github.webhook.processing_failed", { event, action, installationId });
    return NextResponse.json({ error: { code: "WEBHOOK_PROCESSING_FAILED", message: "The GitHub event was verified but could not be applied." } }, { status: 500 });
  }
}

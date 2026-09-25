import { NextResponse } from "next/server";
import { clearGitHubInstallationToken, readGitHubAppConfig, verifyGitHubWebhookSignature } from "../../../../../../lib/server/github-app";
import { getGitHubAppStore } from "../../../../../../lib/server/github-app-store";
import { syncGitHubConnection, updateGenericGitHubIntegrationState } from "../../../../../../lib/server/github-app-service";

export const runtime = "nodejs";

const refreshEvents = new Set(["installation_repositories"]);
const evidenceEvents = new Set(["pull_request", "pull_request_review", "check_run", "check_suite", "status"]);

export async function POST(request: Request) {
  const { config } = readGitHubAppConfig();
  if (!config) return NextResponse.json({ error: "GitHub App is not configured" }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGitHubWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event")?.trim();
  const delivery = request.headers.get("x-github-delivery")?.trim();
  if (!event || !delivery) return NextResponse.json({ error: "Missing GitHub webhook headers" }, { status: 400 });

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Malformed webhook payload" }, { status: 400 }); }
  const installationId = readInstallationId(payload);
  const { store } = getGitHubAppStore();
  const claimed = await store.claimWebhookDelivery(delivery, event, installationId);
  if (!claimed) return NextResponse.json({ ok: true, duplicate: true });
  if (!installationId) return NextResponse.json({ ok: true, ignored: true });

  clearGitHubInstallationToken(installationId);
  const installations = await store.listByInstallationId(installationId);
  if (!installations.length) return NextResponse.json({ ok: true, ignored: true });

  const action = typeof payload.action === "string" ? payload.action : "";
  const now = new Date().toISOString();

  if (event === "installation" && ["deleted", "suspend"].includes(action)) {
    const nextState = action === "deleted" ? "revoked" : "suspended";
    await store.updateInstallationState(installationId, nextState, now);
    await Promise.all(installations.map((installation) => updateGenericGitHubIntegrationState({
      installation: { ...installation, state: nextState, lastEventAt: now, updatedAt: now },
      state: "needs-config",
      code: action === "deleted" ? "GITHUB_APP_REVOKED" : "GITHUB_APP_SUSPENDED",
      now,
    })));
    return NextResponse.json({ ok: true, state: nextState });
  }

  if (
    refreshEvents.has(event)
    || (event === "installation" && ["created", "unsuspend", "new_permissions_accepted"].includes(action))
  ) {
    const results = [];
    for (const installation of installations) {
      try {
        results.push(await syncGitHubConnection({
          scope: { workspaceId: installation.workspaceId, projectId: installation.projectId, environmentId: installation.environmentId },
          installationId,
          installedByUserId: installation.installedByUserId,
          config,
        }));
      } catch {
        await store.updateInstallationState(installationId, "permission-error", now);
        await updateGenericGitHubIntegrationState({ installation: { ...installation, state: "permission-error", updatedAt: now }, state: "needs-config", code: "GITHUB_APP_REFRESH_FAILED", now });
      }
    }
    return NextResponse.json({ ok: true, refreshed: results.length });
  }

  if (evidenceEvents.has(event)) {
    for (const installation of installations) {
      await store.saveInstallation({ ...installation, lastEventAt: now, updatedAt: now });
    }
  }

  return NextResponse.json({ ok: true });
}

function readInstallationId(payload: Record<string, unknown>) {
  const installation = payload.installation;
  if (!installation || typeof installation !== "object" || Array.isArray(installation)) return undefined;
  const id = (installation as { id?: unknown }).id;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

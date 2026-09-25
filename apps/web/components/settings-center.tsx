"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Retention = {
  revision: number;
  decisionRetentionDays: number;
  reviewRetentionDays: number;
  notificationRetentionDays: number;
};

type NotificationPreference = {
  inAppEvents: string[];
  emailEvents: string[];
  projectIds: string[];
  updatedAt: string;
};

type Props = {
  role: "owner" | "admin" | "reviewer" | "member";
  account: { email?: string; displayName?: string };
  canManageWorkspace: boolean;
  canManageIntegrations: boolean;
  canReadIntegrations: boolean;
  workspace: { id: string; name: string; updatedAt: string };
  project: { id: string; name: string };
  environment: { id: string; name: string };
  retention: Retention;
  notificationPreference: NotificationPreference;
  notificationEvents: string[];
  projects: Array<{ id: string; name: string; status: string }>;
  github: { configured: boolean; connected: boolean; account?: string; repositories: number; state: string };
  developer: {
    activeKeys: Array<{ id: string; name: string; keyPrefix: string; lastUsedAt?: string }>;
    activeWebhooks: Array<{ id: string; name: string; url: string; lastDeliveryAt?: string }>;
  };
  settingsPersistence: "supabase" | "memory";
};

type Notice = { tone: "success" | "danger"; title: string; message: string };
const retentionOptions = [
  { value: 0, label: "Keep indefinitely" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 365, label: "1 year" },
  { value: 730, label: "2 years" },
];

const eventLabels: Record<string, string> = {
  "review.created": "New review requested",
  "review.updated": "Review updated",
  "review.resolved": "Review resolved",
  "decision.critical_block": "Critical policy block",
  "integration.failure": "Integration failure",
  "integration.recovered": "Integration recovered",
};

export function SettingsCenter(props: Props) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [retention, setRetention] = useState(props.retention);
  const [confirmation, setConfirmation] = useState("");
  const [inAppEvents, setInAppEvents] = useState(props.notificationPreference.inAppEvents);
  const [emailEvents, setEmailEvents] = useState(props.notificationPreference.emailEvents);
  const [notificationUpdatedAt, setNotificationUpdatedAt] = useState(props.notificationPreference.updatedAt);
  const [disconnectText, setDisconnectText] = useState("");
  const [archiveText, setArchiveText] = useState("");

  const retentionTightened = useMemo(() => {
    const shorter = (before: number, after: number) => after !== 0 && (before === 0 || after < before);
    return shorter(props.retention.decisionRetentionDays, retention.decisionRetentionDays)
      || shorter(props.retention.reviewRetentionDays, retention.reviewRetentionDays)
      || shorter(props.retention.notificationRetentionDays, retention.notificationRetentionDays);
  }, [props.retention, retention]);

  function toggle(values: string[], value: string, checked: boolean) {
    return checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);
  }

  async function request(path: string, init: RequestInit, action: string, success: string) {
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch(path, init);
      const result = await response.json() as Record<string, unknown> & { error?: { message?: string; code?: string } };
      if (!response.ok) {
        setNotice({ tone: "danger", title: result.error?.code === "SETTINGS_CONFLICT" ? "Settings changed elsewhere" : "Action failed", message: result.error?.message ?? "VetoLayer could not save this setting." });
        if (response.status === 409) router.refresh();
        return null;
      }
      setNotice({ tone: "success", title: "Saved", message: success });
      router.refresh();
      return result;
    } catch {
      setNotice({ tone: "danger", title: "Action failed", message: "The settings service is temporarily unavailable." });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function saveRetention() {
    const result = await request("/api/settings/retention", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...retention, expectedRevision: retention.revision, confirmation: retentionTightened ? confirmation : undefined }),
    }, "retention", "Retention policy updated.");
    const next = result?.settings as Retention | undefined;
    if (next) { setRetention(next); setConfirmation(""); }
  }

  async function saveNotifications() {
    const result = await request("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_preferences",
        inAppEvents,
        emailEvents,
        projectIds: props.notificationPreference.projectIds,
        expectedUpdatedAt: notificationUpdatedAt,
      }),
    }, "notifications", "Notification preferences updated.");
    const preference = result?.preference as NotificationPreference | undefined;
    if (preference?.updatedAt) setNotificationUpdatedAt(preference.updatedAt);
  }

  async function disconnectGitHub() {
    if (disconnectText !== "DISCONNECT GITHUB") return;
    const result = await request("/api/integrations/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    }, "disconnect-github", "GitHub disconnected. Historical signed decisions and the security audit remain available according to retention policy.");
    if (result) setDisconnectText("");
  }

  async function archiveWorkspace() {
    if (archiveText !== props.workspace.name) return;
    const result = await request("/api/workspaces/current", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", expectedUpdatedAt: props.workspace.updatedAt }),
    }, "archive-workspace", "Workspace archived. Historical audit records remain append-only.");
    if (result) router.push("/onboarding");
  }

  return (
    <div className="settingsCenter">
      {notice ? <div className={`settingsNotice ${notice.tone}`} role="status"><strong>{notice.title}</strong><span>{notice.message}</span></div> : null}

      <nav className="settingsJumpNav" aria-label="Settings sections">
        <a href="#workspace">Workspace</a><a href="#projects">Projects</a><a href="#integrations">Integrations</a><a href="#developer">API & webhooks</a><a href="#notifications">Notifications</a><a href="#security">Security</a><a href="#data-retention">Data</a><a href="#danger-zone">Danger zone</a>
      </nav>

      <section className="settingsSection" id="integrations">
        <div className="settingsSectionIntro"><span>INTEGRATIONS</span><h2>Execution connections</h2><p>Provider credentials stay server-side. This view only exposes connection state and non-secret identifiers.</p></div>
        <div className="settingsCardGrid">
          <article className="settingsCard">
            <div className="settingsCardHead"><div><strong>GitHub App</strong><small>{props.github.connected ? `${props.github.account ?? "Connected account"} · ${props.github.repositories} repositories` : props.github.configured ? "App configured; no installation connected" : "Platform provider setup required"}</small></div><span className={`settingsStatus ${props.github.connected ? "ready" : "muted"}`}>{props.github.connected ? "Connected" : props.github.state}</span></div>
            <p>{props.github.connected ? "Pull requests and deployment evidence can flow through the active project/environment scope." : "Connect an installation from the integration workspace when you are ready to govern GitHub actions."}</p>
            {props.canReadIntegrations ? <Link href="/dashboard/integrations" className="settingsLink">Manage GitHub connection →</Link> : <span className="settingsRestricted">Your role cannot inspect integration configuration.</span>}
          </article>
          <article className="settingsCard">
            <div className="settingsCardHead"><div><strong>Historical data</strong><small>Disconnect semantics</small></div><span className="settingsStatus ready">Retained</span></div>
            <p>Disconnecting stops new GitHub evaluations. Existing signed Decision Receipts remain until their workspace retention window expires; append-only security audit events are retained indefinitely.</p>
          </article>
        </div>
      </section>

      <section className="settingsSection" id="developer">
        <div className="settingsSectionIntro"><span>API KEYS & WEBHOOKS</span><h2>Programmatic access</h2><p>Secrets are write-only. Existing keys are represented only by their safe prefix; webhook signing secrets are never rendered here.</p></div>
        {props.canReadIntegrations ? <div className="settingsCardGrid">
          <article className="settingsCard"><div className="settingsCardHead"><div><strong>API keys</strong><small>{props.developer.activeKeys.length} active in {props.environment.name}</small></div></div>{props.developer.activeKeys.length ? <ul className="settingsCompactList">{props.developer.activeKeys.slice(0, 4).map((key) => <li key={key.id}><span><strong>{key.name}</strong><small className="mono">{key.keyPrefix}</small></span><small>{key.lastUsedAt ? `Used ${new Date(key.lastUsedAt).toLocaleDateString()}` : "Never used"}</small></li>)}</ul> : <p>No active API keys for this environment.</p>}<Link href="/dashboard/developers" className="settingsLink">Manage keys securely →</Link></article>
          <article className="settingsCard"><div className="settingsCardHead"><div><strong>Webhooks</strong><small>{props.developer.activeWebhooks.length} active endpoints</small></div></div>{props.developer.activeWebhooks.length ? <ul className="settingsCompactList">{props.developer.activeWebhooks.slice(0, 4).map((hook) => <li key={hook.id}><span><strong>{hook.name}</strong><small>{safeDestination(hook.url)}</small></span><small>{hook.lastDeliveryAt ? `Delivered ${new Date(hook.lastDeliveryAt).toLocaleDateString()}` : "No delivery yet"}</small></li>)}</ul> : <p>No active developer webhooks for this environment.</p>}<Link href="/dashboard/developers" className="settingsLink">Manage webhook endpoints →</Link></article>
        </div> : <div className="settingsRestrictedCard">Developer credentials are hidden because your role does not have integration access.</div>}
      </section>

      <section className="settingsSection" id="notifications">
        <div className="settingsSectionIntro"><span>NOTIFICATIONS</span><h2>Your delivery preferences</h2><p>Preferences are personal within this workspace. Project scoping from your existing notification setup is preserved.</p></div>
        <div className="settingsNotificationGrid">
          {props.notificationEvents.map((event) => <div className="settingsNotificationRow" key={event}><div><strong>{eventLabels[event] ?? event}</strong><small>{event}</small></div><label><input type="checkbox" checked={inAppEvents.includes(event)} onChange={(e) => setInAppEvents(toggle(inAppEvents, event, e.target.checked))} /> In app</label><label><input type="checkbox" checked={emailEvents.includes(event)} onChange={(e) => setEmailEvents(toggle(emailEvents, event, e.target.checked))} /> Email</label></div>)}
        </div>
        <div className="settingsActions"><button type="button" className="primaryButton" disabled={Boolean(busy)} onClick={() => void saveNotifications()}>{busy === "notifications" ? "Saving…" : "Save notification preferences"}</button><Link href="/dashboard/notifications" className="secondaryButton">Open notification center</Link></div>
      </section>

      <section className="settingsSection" id="security">
        <div className="settingsSectionIntro"><span>SECURITY & ACCOUNT</span><h2>Identity and session security</h2><p>Authentication changes use the account security flow so passwords and authentication tokens never pass through workspace settings APIs.</p></div>
        <div className="settingsCardGrid"><article className="settingsCard"><strong>{props.account.displayName ?? "VetoLayer user"}</strong><small>{props.account.email ?? "Authenticated account"}</small><p>Change display name, verify email changes, rotate your password, or revoke other sessions from Account Security.</p><Link href="/account" className="settingsLink">Open account security →</Link></article><article className="settingsCard"><strong>Role</strong><small>{props.role}</small><p>Settings are permission-aware. Controls you cannot modify are either read-only or omitted; every mutation is re-authorized on the server.</p></article></div>
      </section>

      <section className="settingsSection" id="data-retention">
        <div className="settingsSectionIntro"><span>DATA & RETENTION</span><h2>Operational history lifecycle</h2><p>Retention applies to decisions, review cases, and notification events. The security audit log is excluded and remains append-only.</p></div>
        <div className="retentionGrid">
          <RetentionSelect label="Decision receipts" value={retention.decisionRetentionDays} disabled={!props.canManageWorkspace || Boolean(busy)} onChange={(value) => setRetention({ ...retention, decisionRetentionDays: value })} />
          <RetentionSelect label="Review cases" value={retention.reviewRetentionDays} disabled={!props.canManageWorkspace || Boolean(busy)} onChange={(value) => setRetention({ ...retention, reviewRetentionDays: value })} />
          <RetentionSelect label="Notifications" value={retention.notificationRetentionDays} disabled={!props.canManageWorkspace || Boolean(busy)} onChange={(value) => setRetention({ ...retention, notificationRetentionDays: value })} />
        </div>
        <div className="retentionFoot"><span>Revision {retention.revision} · {props.settingsPersistence === "supabase" ? "Durable settings" : "Development memory"}</span><span>Audit retention: <strong>Indefinite</strong></span></div>
        {props.canManageWorkspace ? <>{retentionTightened ? <label className="dangerConfirm"><span>Shorter windows can delete older operational records immediately. Type <strong>APPLY RETENTION</strong>.</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="APPLY RETENTION" /></label> : null}<button type="button" className="primaryButton" disabled={Boolean(busy) || (retentionTightened && confirmation !== "APPLY RETENTION")} onClick={() => void saveRetention()}>{busy === "retention" ? "Applying…" : "Save retention policy"}</button></> : <div className="settingsRestricted">Only workspace owners and admins can change retention policy.</div>}
      </section>

      <section className="settingsSection dangerSection" id="danger-zone">
        <div className="settingsSectionIntro"><span>DANGER ZONE</span><h2>Destructive administration</h2><p>These actions are audited and require explicit confirmation. Historical data behavior is stated before the action runs.</p></div>
        {props.github.connected && props.canManageIntegrations ? <div className="dangerAction"><div><strong>Disconnect GitHub</strong><p>Stops new GitHub evaluations. Existing Decision Receipts follow retention; security audit history remains indefinitely.</p></div><label><span>Type DISCONNECT GITHUB</span><input value={disconnectText} onChange={(event) => setDisconnectText(event.target.value)} /></label><button type="button" disabled={Boolean(busy) || disconnectText !== "DISCONNECT GITHUB"} onClick={() => void disconnectGitHub()}>Disconnect GitHub</button></div> : null}
        {props.role === "owner" ? <div className="dangerAction"><div><strong>Archive workspace</strong><p>Stops this workspace from being selected for new work. Historical records are retained according to policy; the append-only audit remains.</p></div><label><span>Type {props.workspace.name}</span><input value={archiveText} onChange={(event) => setArchiveText(event.target.value)} /></label><button type="button" disabled={Boolean(busy) || archiveText !== props.workspace.name} onClick={() => void archiveWorkspace()}>Archive workspace</button></div> : null}
      </section>
    </div>
  );
}

function RetentionSelect(props: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  return <label className="retentionField"><span>{props.label}</span><select value={props.value} disabled={props.disabled} onChange={(event) => props.onChange(Number(event.target.value))}>{retentionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function safeDestination(value: string) {
  try { const url = new URL(value); return `${url.protocol}//${url.host}${url.pathname}`; } catch { return "Configured endpoint"; }
}

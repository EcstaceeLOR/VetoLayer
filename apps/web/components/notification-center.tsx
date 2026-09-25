"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Notice } from "./ui/primitives";

type EventType =
  | "review.created"
  | "review.assigned"
  | "review.evidence_requested"
  | "review.resolved"
  | "decision.blocked_high_severity"
  | "integration.disconnected"
  | "integration.failed"
  | "policy.activated"
  | "policy.deactivated";

type NotificationItem = {
  id: string;
  type: EventType;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  href?: string;
  createdAt: string;
  readAt?: string;
};
type Preference = { inAppEvents: EventType[]; emailEvents: EventType[]; projectIds: string[] };
type Project = { id: string; name: string; status: string };

const labels: Record<EventType, { label: string; group: string }> = {
  "review.created": { label: "Review created", group: "Human review" },
  "review.assigned": { label: "Review assigned to me", group: "Human review" },
  "review.evidence_requested": { label: "Evidence requested", group: "Human review" },
  "review.resolved": { label: "Review resolved", group: "Human review" },
  "decision.blocked_high_severity": { label: "High-severity BLOCK", group: "Decisions" },
  "integration.disconnected": { label: "Integration disconnected", group: "Integrations" },
  "integration.failed": { label: "Integration failing", group: "Integrations" },
  "policy.activated": { label: "Policy activated", group: "Policies" },
  "policy.deactivated": { label: "Policy deactivated", group: "Policies" },
};

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [preference, setPreference] = useState<Preference>({ inAppEvents: [], emailEvents: [], projectIds: [] });
  const [events, setEvents] = useState<EventType[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [persistence, setPersistence] = useState("loading");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications?limit=100", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Notification center could not be loaded.");
      setNotifications(payload.notifications ?? []);
      setPreference(payload.preference);
      setEvents(payload.eventTypes ?? []);
      setProjects(payload.projects ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
      setPersistence(payload.persistence ?? "unknown");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notification center could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function mutate(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Notification action failed.");
      await load();
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notification action failed.");
      throw cause;
    } finally {
      setBusy(null);
    }
  }

  async function savePreferences() {
    try {
      await mutate("update_preferences", preference);
      setMessage("Notification preferences saved.");
    } catch {}
  }

  async function markRead(id: string) {
    try { await mutate("mark_read", { id }); } catch {}
  }

  async function markAllRead() {
    try {
      await mutate("mark_all_read");
      setMessage("All notifications marked as read.");
    } catch {}
  }

  const groups = useMemo(() => {
    const result = new Map<string, EventType[]>();
    for (const event of events) {
      const group = labels[event]?.group ?? "Other";
      result.set(group, [...(result.get(group) ?? []), event]);
    }
    return [...result.entries()];
  }, [events]);

  if (loading) return <section className="notificationLoading"><span className="pulse" /> Loading notification center…</section>;
  if (error && !notifications.length && !events.length) return <EmptyState title="Notification center is unavailable" description={error} action={<Button onClick={() => void load()}>Retry</Button>} />;

  return (
    <div className="notificationLayout">
      <section className="notificationFeedPanel">
        <div className="notificationPanelHeader">
          <div><span className="vlEyebrow">INBOX</span><h2>{unreadCount ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}` : "You’re caught up"}</h2><p>{persistence === "supabase" ? "Durable workspace notification history" : "Development memory mode"}</p></div>
          {unreadCount ? <Button variant="secondary" disabled={busy !== null} onClick={() => void markAllRead()}>Mark all read</Button> : null}
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {message ? <Notice tone="success">{message}</Notice> : null}
        {notifications.length ? (
          <div className="notificationFeed">
            {notifications.map((item) => (
              <article key={item.id} className={`notificationCard ${item.readAt ? "read" : "unread"} ${item.severity}`}>
                <div className="notificationCardTop"><span className={`notificationSeverity ${item.severity}`}>{item.severity}</span><time>{formatDate(item.createdAt)}</time></div>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <div className="notificationCardActions">
                  {item.href ? <Link href={item.href} onClick={() => { if (!item.readAt) void markRead(item.id); }}>Open →</Link> : null}
                  {!item.readAt ? <button type="button" disabled={busy !== null} onClick={() => void markRead(item.id)}>Mark read</button> : <span>Read</span>}
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No notifications yet" description="Review alerts, critical blocks, policy changes, and integration failures will appear here when they happen." />}
      </section>

      <aside className="notificationPreferencesPanel">
        <div className="notificationPanelHeader"><div><span className="vlEyebrow">PREFERENCES</span><h2>Choose signal over noise.</h2><p>In-product and email channels are configured independently.</p></div></div>
        <div className="notificationPreferenceGroups">
          {groups.map(([group, groupEvents]) => (
            <section className="notificationPreferenceGroup" key={group}>
              <h3>{group}</h3>
              {groupEvents.map((event) => (
                <div className="notificationPreferenceRow" key={event}>
                  <div><strong>{labels[event]?.label ?? event}</strong><small>{event}</small></div>
                  <label><input type="checkbox" checked={preference.inAppEvents.includes(event)} onChange={() => setPreference((current) => ({ ...current, inAppEvents: toggle(current.inAppEvents, event) }))} /> In-app</label>
                  <label><input type="checkbox" checked={preference.emailEvents.includes(event)} onChange={() => setPreference((current) => ({ ...current, emailEvents: toggle(current.emailEvents, event) }))} /> Email</label>
                </div>
              ))}
            </section>
          ))}
        </div>
        <section className="notificationProjectScope">
          <h3>Project subscriptions</h3>
          <p>{preference.projectIds.length ? "Only selected projects generate your alerts." : "All workspace projects currently generate your alerts."}</p>
          <label className="notificationAllProjects"><input type="checkbox" checked={!preference.projectIds.length} onChange={(event) => { if (event.target.checked) setPreference((current) => ({ ...current, projectIds: [] })); else if (projects[0]) setPreference((current) => ({ ...current, projectIds: [projects[0]!.id] })); }} /> All projects</label>
          {projects.map((project) => (
            <label key={project.id}><input type="checkbox" disabled={!preference.projectIds.length} checked={preference.projectIds.includes(project.id)} onChange={() => setPreference((current) => ({ ...current, projectIds: toggle(current.projectIds, project.id) }))} /> {project.name}{project.status === "archived" ? " · archived" : ""}</label>
          ))}
        </section>
        <Button disabled={busy !== null} onClick={() => void savePreferences()}>{busy === "update_preferences" ? "Saving…" : "Save preferences"}</Button>
      </aside>
    </div>
  );
}

function toggle<T extends string>(items: T[], value: T) { return items.includes(value) ? items.filter((item) => item !== value) : [...items, value]; }
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

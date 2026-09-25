"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyState, Field, Input, Notice, Select } from "./ui/primitives";

type AuditEvent = {
  id: string;
  workspaceId: string;
  projectId?: string;
  environmentId?: string;
  actorKind: "human" | "service" | "system";
  actorUserId?: string;
  actorLabel?: string;
  actorRole?: string;
  action: string;
  category: string;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  href?: string;
  requestId?: string;
  correlationId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type Project = { id: string; name: string; status: string };
type Environment = { id: string; projectId: string; name: string; status: string };

type AuditPayload = {
  events: AuditEvent[];
  projects: Project[];
  environments: Environment[];
  nextBefore?: string | null;
  persistence: string;
};

const categoryTone: Record<string, "neutral" | "accent" | "success" | "warning" | "danger" | "info"> = {
  security: "danger",
  credential: "warning",
  webhook: "warning",
  integration: "info",
  policy: "accent",
  review: "warning",
  member: "info",
  workspace: "neutral",
  project: "neutral",
  environment: "neutral",
  settings: "neutral",
};

export function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("");
  const [projectId, setProjectId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [persistence, setPersistence] = useState("loading");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (actor.trim()) params.set("actor", actor.trim());
    if (action.trim()) params.set("action", action.trim());
    if (resource.trim()) params.set("resource", resource.trim());
    if (projectId) params.set("projectId", projectId);
    if (environmentId) params.set("environmentId", environmentId);
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    return params;
  }, [actor, action, resource, projectId, environmentId, from, to]);

  async function load(append = false) {
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(query);
      if (append && nextBefore) params.set("before", nextBefore);
      const response = await fetch(`/api/audit?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as AuditPayload & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Audit log could not be loaded.");
      setEvents((current) => append ? [...current, ...(payload.events ?? [])] : payload.events ?? []);
      setProjects(payload.projects ?? []);
      setEnvironments(payload.environments ?? []);
      setNextBefore(payload.nextBefore ?? null);
      setPersistence(payload.persistence ?? "unknown");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audit log could not be loaded.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => { void load(false); }, [query.toString()]);

  const availableEnvironments = environments.filter((environment) => !projectId || environment.projectId === projectId);
  const exportBase = `/api/audit/export?${query.toString()}`;

  return (
    <div className="auditLayout">
      <section className="auditToolbar" aria-label="Audit filters">
        <div className="auditFilterGrid">
          <Field label="Actor"><Input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Name or user ID" /></Field>
          <Field label="Action"><Input value={action} onChange={(event) => setAction(event.target.value)} placeholder="policy.activate" /></Field>
          <Field label="Resource"><Input value={resource} onChange={(event) => setResource(event.target.value)} placeholder="policy, review, key…" /></Field>
          <Field label="Project">
            <Select value={projectId} onChange={(event) => { setProjectId(event.target.value); setEnvironmentId(""); }}>
              <option value="">All projects</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.status === "archived" ? " · archived" : ""}</option>)}
            </Select>
          </Field>
          <Field label="Environment">
            <Select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)}>
              <option value="">All environments</option>
              {availableEnvironments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}{environment.status === "archived" ? " · archived" : ""}</option>)}
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        </div>
        <div className="auditToolbarActions">
          <span className="auditPersistence">{persistence === "supabase" ? "Durable append-only history" : "Development memory mode"}</span>
          <a className="vlButton vlButtonSecondary vlButtonSm" href={`${exportBase}&format=csv`}>Export CSV</a>
          <a className="vlButton vlButtonSecondary vlButtonSm" href={`${exportBase}&format=json`}>Export JSON</a>
          <Button size="sm" tone="ghost" onClick={() => { setActor(""); setAction(""); setResource(""); setProjectId(""); setEnvironmentId(""); setFrom(""); setTo(""); }}>Clear filters</Button>
        </div>
      </section>

      {error ? <Notice tone="danger" title="Audit log unavailable" role="alert">{error}</Notice> : null}
      {loading ? <section className="auditLoading"><span className="pulse" /> Loading audit history…</section> : null}
      {!loading && !events.length ? <EmptyState eyebrow="AUDIT" title="No matching activity" copy="Administrative and governance actions will appear here as append-only events. Adjust the filters if you expected to see older activity." /> : null}

      {!loading && events.length ? (
        <section className="auditTimeline" aria-label="Audit events">
          {events.map((event) => (
            <article className="auditEvent" key={event.id}>
              <div className="auditEventRail" aria-hidden="true"><span /></div>
              <div className="auditEventBody">
                <div className="auditEventTop">
                  <div className="auditEventIdentity">
                    <Badge tone={categoryTone[event.category] ?? "neutral"}>{event.category}</Badge>
                    <strong>{event.action}</strong>
                  </div>
                  <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                </div>
                <h3>{event.targetLabel ?? event.targetId ?? event.targetType}</h3>
                <p className="auditActor">{event.actorLabel ?? event.actorKind}{event.actorRole ? ` · ${event.actorRole}` : ""} <span>→ {event.targetType}</span></p>
                <div className="auditMetaGrid">
                  {event.projectId ? <span><small>Project</small>{projectName(projects, event.projectId)}</span> : null}
                  {event.environmentId ? <span><small>Environment</small>{environmentName(environments, event.environmentId)}</span> : null}
                  {event.requestId ? <span><small>Request</small><code>{event.requestId}</code></span> : null}
                  {event.correlationId ? <span><small>Correlation</small><code>{event.correlationId}</code></span> : null}
                </div>
                {Object.keys(event.metadata ?? {}).length ? <details className="auditDetails"><summary>Event metadata</summary><pre>{JSON.stringify(event.metadata, null, 2)}</pre></details> : null}
                {event.href ? <Link className="auditDeepLink" href={event.href}>Open affected resource →</Link> : null}
              </div>
            </article>
          ))}
          {nextBefore ? <div className="auditLoadMore"><Button disabled={loadingMore} onClick={() => void load(true)}>{loadingMore ? "Loading…" : "Load older events"}</Button></div> : null}
        </section>
      ) : null}
    </div>
  );
}

function projectName(projects: Project[], id: string) { return projects.find((project) => project.id === id)?.name ?? id; }
function environmentName(environments: Environment[], id: string) { return environments.find((environment) => environment.id === id)?.name ?? id; }
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

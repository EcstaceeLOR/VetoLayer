"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Field, Input, Notice, OutcomeBadge, Textarea } from "../../../components/ui/primitives";
import "./developer-console.css";

type ApiKeyItem = { id: string; name: string; keyPrefix: string; permissions: string[]; status: "active" | "revoked"; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };
type WebhookItem = { id: string; name: string; url: string; events: string[]; status: "active" | "revoked"; createdAt: string; updatedAt: string; lastDeliveryAt: string | null };
type DeliveryItem = { id: string; endpointId: string; eventId: string; eventType: string; status: "pending" | "delivered" | "failed"; attempts: number; statusCode?: number; error?: string; createdAt: string };
type RequestItem = { id: string; requestId: string; keyId?: string; actionId: string; outcome: "ALLOW" | "REVIEW" | "BLOCK"; receiptId?: string; latencyMs: number; createdAt: string };
type ConsoleState = {
  scope: { workspaceId: string; projectId: string; environmentId: string };
  persistence: "supabase" | "memory";
  keys: ApiKeyItem[];
  webhooks: WebhookItem[];
  deliveries: DeliveryItem[];
  requests: RequestItem[];
  webhookEvents: string[];
};

type RevealedSecret = { kind: "api" | "webhook"; value: string; label: string } | null;

const sampleRequest = JSON.stringify({
  action: {
    id: "deploy_identity_api",
    actor: { id: "coding-agent", kind: "agent", name: "Coding Agent" },
    action: { type: "deployment", tool: "github", operation: "deploy-production", arguments: { repository: "identity-api" } },
    target: { type: "service", id: "identity-api", environment: "production" },
    context: { source: "developer-console", environment: "production" },
    requestedAt: "2026-09-25T08:00:00.000Z"
  },
  policies: [{
    id: "high-risk-deploy-review",
    name: "High-risk production deploys require review",
    description: "Route high-risk production changes to human review.",
    mode: "deterministic",
    severity: "high",
    priority: 1,
    enabled: true,
    requiredEvidence: [],
    exceptions: [],
    scope: { actionTypes: ["deployment"], tools: ["github"], environments: ["production"] },
    rule: { effect: "review", match: "all", conditions: [{ field: "facts.riskScore", operator: "greater_than_or_equal", value: 70 }] }
  }],
  evidence: [],
  facts: { riskScore: 85 },
  environment: { releaseChannel: "production" }
}, null, 2);

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? "VetoLayer could not complete that request.");
  return body;
}

export function DeveloperConsole({ projectName, environmentName }: { projectName: string; environmentName: string }) {
  const [state, setState] = useState<ConsoleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<RevealedSecret>(null);
  const [keyName, setKeyName] = useState("Production agent");
  const [permissions, setPermissions] = useState<string[]>(["evaluate", "read:decisions"]);
  const [webhookName, setWebhookName] = useState("Operations webhook");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["decision.created", "review.created", "review.resolved"]);
  const [testerPayload, setTesterPayload] = useState(sampleRequest);
  const [testResult, setTestResult] = useState<{ outcome: "ALLOW" | "REVIEW" | "BLOCK"; receiptId: string; requestId: string } | null>(null);
  const [baseUrl, setBaseUrl] = useState("https://your-vetolayer-domain.example");

  useEffect(() => { if (typeof window !== "undefined") setBaseUrl(window.location.origin); }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/developer/console", { cache: "no-store" });
      setState(await readJson(response));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Developer Console could not be loaded.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(action: string, payload: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/developer/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await readJson(response);
      if (body.secret) setSecret({ kind: "api", value: body.secret, label: "API key" });
      if (body.signingSecret) setSecret({ kind: "webhook", value: body.signingSecret, label: "Webhook signing secret" });
      if (body.result?.receipt) {
        setTestResult({ outcome: body.result.decision.outcome, receiptId: body.result.receipt.receiptId, requestId: body.result.requestId });
      }
      await load();
      return body;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
      return null;
    } finally { setBusy(null); }
  }

  const sdkSnippet = useMemo(() => `import { createVetoLayerClient, guardedToolCall } from "@vetolayer/sdk";\n\nconst veto = createVetoLayerClient({\n  baseUrl: "${baseUrl}",\n  apiKey: process.env.VETOLAYER_API_KEY!,\n});\n\nconst result = await guardedToolCall({\n  client: veto,\n  evaluation,\n  execute: () => highImpactToolCall(),\n});`, [baseUrl]);

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  if (loading) return <div className="developerLoading">Loading Developer Console…</div>;

  return (
    <div className="developerConsole">
      {error ? <Notice tone="danger" title="Developer Console action failed" role="alert">{error}</Notice> : null}
      {secret ? (
        <Notice tone="warning" title={`${secret.label} — copy it now`} role="status">
          This secret is shown once and cannot be recovered later.
          <span className="secretReveal"><code>{secret.value}</code><Button size="sm" onClick={() => void navigator.clipboard.writeText(secret.value)}>Copy</Button><Button size="sm" tone="ghost" onClick={() => setSecret(null)}>Dismiss</Button></span>
        </Notice>
      ) : null}

      <section className="developerGrid developerIntroGrid">
        <Card raised className="developerScopeCard">
          <span className="vlEyebrow">Active API scope</span>
          <h2>{projectName}</h2>
          <p>{environmentName}</p>
          <div className="scopePills"><Badge tone="accent">Project scoped</Badge><Badge tone={state?.persistence === "supabase" ? "success" : "warning"}>{state?.persistence === "supabase" ? "Durable persistence" : "Memory only"}</Badge></div>
        </Card>
        <Card className="developerSnippetCard">
          <span className="vlEyebrow">SDK quickstart</span>
          <pre><code>{sdkSnippet}</code></pre>
        </Card>
      </section>

      <section className="developerSection" aria-labelledby="api-keys-heading">
        <div className="developerSectionHead"><div><span className="vlEyebrow">Credentials</span><h2 id="api-keys-heading">Project API keys</h2><p>Create narrowly scoped credentials. The full secret is only returned once.</p></div></div>
        <div className="developerGrid">
          <Card className="developerFormCard">
            <Field label="Key name"><Input value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="Production agent" /></Field>
            <div className="permissionGroup"><span>Permissions</span>{["evaluate", "read:decisions", "webhooks"].map((permission) => <label key={permission}><input type="checkbox" checked={permissions.includes(permission)} onChange={() => toggle(permissions, permission, setPermissions)} /> <code>{permission}</code></label>)}</div>
            <Button tone="primary" disabled={busy !== null} onClick={() => void act("create_key", { name: keyName, permissions })}>{busy === "create_key" ? "Creating…" : "Create API key"}</Button>
          </Card>
          <Card className="developerListCard">
            {!state?.keys.length ? <p className="developerEmpty">No API keys yet.</p> : state.keys.map((key) => (
              <div className="developerRow" key={key.id}>
                <div><strong>{key.name}</strong><code>{key.keyPrefix}</code><small>{key.permissions.join(" · ")}</small></div>
                <div className="developerRowActions"><Badge tone={key.status === "active" ? "success" : "neutral"}>{key.status}</Badge>{key.status === "active" ? <><Button size="sm" onClick={() => void act("rotate_key", { id: key.id })}>Rotate</Button><Button size="sm" tone="danger" onClick={() => void act("revoke_key", { id: key.id })}>Revoke</Button></> : null}</div>
              </div>
            ))}
          </Card>
        </div>
      </section>

      <section className="developerSection" aria-labelledby="tester-heading">
        <div className="developerSectionHead"><div><span className="vlEyebrow">Request tester</span><h2 id="tester-heading">Run the real evaluation pipeline</h2><p>Edit the payload, evaluate it against the current project/environment, and inspect the persisted Decision Receipt.</p></div></div>
        <Card className="developerTester">
          <Textarea aria-label="Developer API request payload" value={testerPayload} onChange={(event) => setTesterPayload(event.target.value)} rows={22} spellCheck={false} />
          <div className="testerActions"><Button tone="primary" disabled={busy !== null} onClick={() => { try { void act("test_evaluation", { payload: JSON.parse(testerPayload) }); } catch { setError("The request tester contains invalid JSON."); } }}>{busy === "test_evaluation" ? "Evaluating…" : "Evaluate action"}</Button>{testResult ? <div className="testResult"><OutcomeBadge outcome={testResult.outcome} /><span>{testResult.requestId}</span><Link href={`/dashboard/decisions/${encodeURIComponent(testResult.receiptId)}`}>Open receipt →</Link></div> : null}</div>
        </Card>
      </section>

      <section className="developerSection" aria-labelledby="webhooks-heading">
        <div className="developerSectionHead"><div><span className="vlEyebrow">Outbound events</span><h2 id="webhooks-heading">Webhooks</h2><p>Signed server-to-server delivery with one-time signing secrets, connection tests, rotation, and retry history.</p></div></div>
        <div className="developerGrid">
          <Card className="developerFormCard">
            <Field label="Endpoint name"><Input value={webhookName} onChange={(event) => setWebhookName(event.target.value)} /></Field>
            <Field label="HTTPS endpoint"><Input type="url" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://example.com/vetolayer" /></Field>
            <div className="permissionGroup"><span>Events</span>{(state?.webhookEvents ?? []).map((event) => <label key={event}><input type="checkbox" checked={webhookEvents.includes(event)} onChange={() => toggle(webhookEvents, event, setWebhookEvents)} /> <code>{event}</code></label>)}</div>
            <Button tone="primary" disabled={busy !== null || !webhookUrl} onClick={() => void act("create_webhook", { name: webhookName, url: webhookUrl, events: webhookEvents })}>{busy === "create_webhook" ? "Creating…" : "Create webhook"}</Button>
          </Card>
          <Card className="developerListCard">
            {!state?.webhooks.length ? <p className="developerEmpty">No webhook endpoints yet.</p> : state.webhooks.map((webhook) => (
              <div className="developerRow developerWebhookRow" key={webhook.id}>
                <div><strong>{webhook.name}</strong><span>{webhook.url}</span><small>{webhook.events.join(" · ")}</small></div>
                <div className="developerRowActions"><Badge tone={webhook.status === "active" ? "success" : "neutral"}>{webhook.status}</Badge>{webhook.status === "active" ? <><Button size="sm" onClick={() => void act("test_webhook", { id: webhook.id })}>Test</Button><Button size="sm" onClick={() => void act("rotate_webhook_secret", { id: webhook.id })}>Rotate secret</Button><Button size="sm" tone="danger" onClick={() => void act("revoke_webhook", { id: webhook.id })}>Revoke</Button></> : null}</div>
              </div>
            ))}
          </Card>
        </div>
      </section>

      <section className="developerGrid developerHistoryGrid">
        <Card>
          <span className="vlEyebrow">Recent API requests</span><h2>Usage activity</h2>
          {!state?.requests.length ? <p className="developerEmpty">No API requests recorded for this scope.</p> : state.requests.map((request) => <div className="historyRow" key={request.id}><OutcomeBadge outcome={request.outcome} /><div><strong>{request.actionId}</strong><small>{request.latencyMs} ms · {new Date(request.createdAt).toLocaleString()}</small></div>{request.receiptId ? <Link href={`/dashboard/decisions/${encodeURIComponent(request.receiptId)}`}>Receipt</Link> : null}</div>)}
        </Card>
        <Card>
          <span className="vlEyebrow">Webhook deliveries</span><h2>Delivery history</h2>
          {!state?.deliveries.length ? <p className="developerEmpty">No webhook deliveries yet.</p> : state.deliveries.map((delivery) => <div className="historyRow" key={delivery.id}><Badge tone={delivery.status === "delivered" ? "success" : delivery.status === "failed" ? "danger" : "warning"}>{delivery.status}</Badge><div><strong>{delivery.eventType}</strong><small>Attempt {delivery.attempts}{delivery.statusCode ? ` · HTTP ${delivery.statusCode}` : ""}</small></div>{delivery.status === "failed" ? <Button size="sm" onClick={() => void act("retry_delivery", { id: delivery.id })}>Retry</Button> : null}</div>)}
        </Card>
      </section>
    </div>
  );
}

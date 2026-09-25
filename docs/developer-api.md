# VetoLayer Developer API

The Developer API is the framework-agnostic boundary for evaluate-before-execute integrations. GitHub is one adapter; `/api/v1/evaluate` accepts any action that satisfies the VetoLayer core contracts.

## Product-scoped authentication

Create API keys from **Dashboard → Developer**. Every key is bound on the server to the workspace, project, and environment selected when it is created. Clients cannot override that scope with a header or request field.

A key secret is returned exactly once. VetoLayer stores its SHA-256 hash plus a non-sensitive prefix for identification; the original API key cannot be recovered later. Rotate or revoke a key from the Developer Console if the secret is lost or exposed.

Available key permissions are:

- `evaluate` — submit action evaluations and create Decision Receipts.
- `read:decisions` — list and retrieve Decision Receipts in the key's scope.
- `webhooks` — reserved for developer automation that needs webhook-level API access.

Send the key as a bearer token:

```text
Authorization: Bearer vl_live_...
```

`VETOLAYER_API_KEY` and the old `VETOLAYER_API_*_ID` deployment variables are retained only as a backwards-compatible migration path. Normal product usage does not require a deployment-wide API key.

## Evaluate

`POST /api/v1/evaluate`

```json
{
  "action": { "...": "ActionRequest" },
  "policies": [{ "...": "Policy" }],
  "evidence": [{ "...": "Evidence" }],
  "facts": { "amount": 750 },
  "environment": { "region": "us-east" }
}
```

The endpoint runtime-validates all core objects, runs `evaluateAction(...)`, executes deterministic rules first, calls SERV only when contextual policy is applicable, creates a tamper-evident Decision Receipt, and stores that receipt inside the API key's product scope.

A successful response includes `requestId`, the normalized `decision`, `receipt`, reasoning `trace`, optional SERV `providerTrace`, `scope`, `latencyMs`, and the current persistence mode. `REVIEW` and `BLOCK` are never approvals. Provider failure cannot turn into `ALLOW`.

The Developer Console's Request Tester calls this exact endpoint with the project key entered in the tester. A successful test therefore produces a real Decision Receipt and appears in recent API usage.

## Read decisions

`GET /api/v1/decisions?limit=50`

Requires `read:decisions`. Returns recent receipts only from the key's workspace/project/environment.

`GET /api/v1/decisions/:receiptId`

Also requires `read:decisions`. If the receipt belongs to another project/environment, the API returns `DECISION_NOT_FOUND` rather than leaking cross-scope existence.

## SDK

```ts
import { createVetoLayerClient } from "@vetolayer/sdk";

const veto = createVetoLayerClient({
  baseUrl: "https://your-vetolayer-host.example",
  apiKey: process.env.VETOLAYER_PROJECT_API_KEY!,
});

const result = await veto.evaluate({ action, policies, evidence, facts });
if (result.decision.outcome !== "ALLOW") return result;

// Execute the governed action only after ALLOW.
```

The SDK also exposes `getDecision(receiptId)`, `listDecisions(limit)`, and `guardedToolCall(...)`. The server remains the source of truth for authorization, policy evaluation, receipt creation, and scope.

## Signed webhooks

Webhook endpoints are managed from the Developer Console and are bound to the selected project/environment. Production destinations must use HTTPS; private-network and credential-bearing URLs are rejected to reduce SSRF risk.

Webhook signing secrets are encrypted at rest with AES-256-GCM using the server-only `VETOLAYER_CREDENTIAL_ENCRYPTION_KEY`. The plaintext signing secret is shown only when the endpoint is created or the secret is rotated.

Each delivery sends:

```text
Content-Type: application/json
User-Agent: VetoLayer-Webhook/1.0
X-VetoLayer-Event-Id: evt_...
X-VetoLayer-Event-Type: decision.created
X-VetoLayer-Signature: sha256=<hex HMAC>
```

Verify `X-VetoLayer-Signature` by computing HMAC-SHA256 over the **exact raw request body** using the endpoint signing secret, then compare signatures using a timing-safe comparison.

The Developer Console can send a live test delivery, shows status/attempt history, and allows failed deliveries to be retried. Current event subscriptions include `decision.created`, `review.created`, `review.resolved`, `policy.changed`, and `integration.changed`; later product event producers can reuse the same signed delivery layer.

## Usage and rate limits

Authenticated evaluations are rate-limited per project key using `VETOLAYER_API_RATE_LIMIT_PER_MINUTE` (default `60`). A `429 RATE_LIMITED` response includes `Retry-After`.

Recent successful evaluations are recorded with request id, key id, action id, outcome, receipt id, latency, scope, and timestamp. API-key last-used time is updated on successful credential validation without exposing the secret.

## Error model

Errors use the shape:

```json
{
  "error": {
    "code": "INVALID_ACTION",
    "message": "Action Request does not satisfy the VetoLayer contract.",
    "details": []
  }
}
```

Common codes include `API_KEY_REQUIRED`, `INVALID_API_KEY`, `API_KEY_SCOPE_FORBIDDEN`, `INVALID_JSON`, `INVALID_ACTION`, `POLICIES_REQUIRED`, `INVALID_POLICY`, `INVALID_EVIDENCE`, `INVALID_FACTS`, `INVALID_ENVIRONMENT`, `RATE_LIMITED`, `EVALUATION_FAILED`, `DECISION_NOT_FOUND`, and `DECISION_STORE_UNAVAILABLE`.

## Production persistence

Production key/webhook management requires the Supabase server store and migration `202609250950_developer_console.sql`. Browser roles receive no direct table grants and RLS is enabled. API key secrets are never persisted; only their hashes are stored. Webhook signing secrets must remain recoverable by the server for outbound HMAC signing, so they are persisted only as encrypted ciphertext.

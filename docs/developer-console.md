# Developer Console

VetoLayer's Developer Console is the normal product path for API access. Users create credentials inside a selected workspace, project, and environment instead of asking a deployment administrator to configure one global bearer token.

## API keys

A key is bound server-side to exactly one workspace/project/environment scope. Supported permissions are:

- `evaluate` — submit actions to `POST /api/v1/evaluate`
- `read:decisions` — read the scoped decision stream from `GET /api/v1/decisions`
- `webhooks` — reserved for webhook-capable automation surfaces

Key secrets use the `vl_live_...` format. The complete secret is returned only by create/rotate responses and is never persisted. VetoLayer stores a SHA-256 digest plus a short display prefix, creation metadata, permissions, status, and last-used time.

Revocation is immediate. Rotation revokes the previous key and creates a new secret with the same name and permissions.

The older `VETOLAYER_API_KEY` deployment variable remains supported only as a backwards-compatible server-managed credential. New product integrations should use project API keys.

## SDK

```ts
import { createVetoLayerClient, guardedToolCall } from "@vetolayer/sdk";

const veto = createVetoLayerClient({
  baseUrl: process.env.VETOLAYER_URL!,
  apiKey: process.env.VETOLAYER_PROJECT_API_KEY!,
});

const result = await guardedToolCall({
  client: veto,
  evaluation,
  execute: () => highImpactToolCall(),
});
```

The key's stored scope is authoritative. Clients cannot override workspace/project/environment with request headers or JSON fields.

## Request tester

The Developer Console tester calls the real `POST /api/v1/evaluate` endpoint with `Authorization: Bearer <project key>`. A newly created or rotated API key is filled into the tester only for the current browser session; existing secrets are never recoverable from VetoLayer.

Successful tests therefore exercise the same authentication, key-permission, rate-limit, validation, evaluation, persistence, and receipt path used by external applications. They create normal Decision Receipts and appear in recent API request activity.

## Outbound webhooks

Webhook endpoints are scoped to the selected project/environment. HTTPS is required outside local development and obvious local/private destinations are rejected. VetoLayer generates a signing secret once, encrypts the recoverable server-side copy with AES-256-GCM, and never returns the stored secret after creation.

Configure a stable server-only value:

```text
VETOLAYER_CREDENTIAL_ENCRYPTION_KEY=<long random secret>
```

Every delivery includes:

```text
X-VetoLayer-Event-Id: evt_...
X-VetoLayer-Event-Type: decision.created
X-VetoLayer-Signature: sha256=<hex hmac>
```

The signature is HMAC-SHA256 over the exact HTTP request body using the endpoint signing secret. Consumers should compute the same HMAC and compare signatures before processing an event.

Developer Console supports connection tests, secret rotation, revocation, delivery history, and retry of failed deliveries. Broader product event subscriptions and notification preferences are expanded in Issue #61.

## Persistence

Production credential management requires durable Supabase persistence. Apply the repository's `supabase/migrations/202609250950_developer_console.sql` migration (the SQL reference in `docs/sql/developer-console.sql` contains the same model), then configure:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
VETOLAYER_CREDENTIAL_ENCRYPTION_KEY=
```

All Developer Console tables have RLS enabled with no browser policies. The application server uses the service role only after resolving and authorizing the signed-in workspace context.

## Security boundaries

- Complete API keys are never stored.
- Webhook signing secrets are encrypted server-side and are write-only in product UI.
- API keys cannot choose a different product scope at request time.
- Decision reads verify the exact project/environment scope as well as the workspace.
- Revoked keys are excluded from authentication immediately.
- Browser responses never include key hashes or encrypted signing-secret material.
- Credential management requires the workspace role's existing `integrations.write` permission.
- Archived projects reject credential/configuration changes.

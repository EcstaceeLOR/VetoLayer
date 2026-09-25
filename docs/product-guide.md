# VetoLayer product and developer guide

Release: **2026.09**  
Last updated: **2026-09-25**

This is the canonical public guide for the shipped product. The same concepts are available in-product at `/dashboard/docs`.

## Core model

VetoLayer evaluates an `ActionRequest` before an autonomous system executes it. The active project/environment policy set is resolved server-side, deterministic policy is evaluated first, contextual reasoning is used only when a contextual policy needs it, and the result is one of `ALLOW`, `REVIEW`, or `BLOCK`.

- `ALLOW`: the caller may execute the governed action.
- `REVIEW`: stop execution and use the operational Human Review workflow.
- `BLOCK`: stop execution. Human approval is evidence for a later re-evaluation; it cannot bypass deterministic hard-block policy.

Every evaluation creates an immutable Decision Receipt. Re-evaluations create new receipts and remain linked through lineage.

## Product scope

A Workspace is the organization boundary. Projects divide governed applications or systems. Environments divide execution contexts such as development, staging, and production.

Developer API keys are created from Dashboard → Developer and are bound server-side to one workspace/project/environment. Clients do **not** select scope using global workspace headers or request fields.

## SDK quickstart

```ts
import { exampleActionRequests } from "@vetolayer/core";
import { createVetoLayerClient } from "@vetolayer/sdk";

const veto = createVetoLayerClient({
  baseUrl: process.env.VETOLAYER_URL!,
  apiKey: process.env.VETOLAYER_PROJECT_API_KEY!,
});

const evaluation = await veto.evaluate({
  action: exampleActionRequests.refund,
  evidence: [],
  facts: { customerRisk: "normal" },
});

if (evaluation.decision.outcome !== "ALLOW") return evaluation;
// Execute the real action only after ALLOW.
```

The matching compile-checked source is `packages/sdk/src/docs-quickstart.ts` and is included in normal SDK typechecking.

## Developer API

Authentication:

```text
Authorization: Bearer vl_live_...
```

Endpoints:

- `POST /api/v1/evaluate`
- `GET /api/v1/decisions?limit=50`
- `GET /api/v1/decisions/:receiptId`

Managed Policy Studio versions are authoritative when active. Request-supplied policies remain only as a migration fallback for a scope with no active managed policies.

Common errors include `API_KEY_REQUIRED`, `INVALID_API_KEY`, `API_KEY_SCOPE_FORBIDDEN`, `INVALID_JSON`, `INVALID_ACTION`, `POLICIES_REQUIRED`, `INVALID_POLICY`, `INVALID_EVIDENCE`, `RATE_LIMITED`, `EVALUATION_FAILED`, `DECISION_NOT_FOUND`, and `DECISION_STORE_UNAVAILABLE`.

## GitHub App

Use the VetoLayer GitHub App installation flow from Dashboard → Integrations. Workspace users do not need and should not provide personal GitHub access tokens.

The server verifies installation access before binding an installation, verifies GitHub webhook signatures, and rejects replayed delivery IDs. Selected repositories are scoped to the active VetoLayer project/environment.

## Webhooks

Developer webhook endpoints are created in Dashboard → Developer. Production destinations must use HTTPS and may not target local/private networks or embed credentials.

Deliveries include:

```text
Content-Type: application/json
User-Agent: VetoLayer-Webhook/1.0
X-VetoLayer-Event-Id: evt_...
X-VetoLayer-Event-Type: review.created
X-VetoLayer-Signature: sha256=<hex HMAC>
```

Verify the signature using HMAC-SHA256 over the **exact raw request body** and compare the full `sha256=` value with a timing-safe comparison.

Supported event names include decision creation/high-severity blocks, review lifecycle events, policy lifecycle events, and integration lifecycle/failure events. See `/dashboard/docs/webhooks` for the current list.

## Policy authoring

Use deterministic policy for reproducible constraints such as thresholds, permissions, environments, required evidence, and hard denies. Use contextual policy only for judgment that genuinely requires semantic interpretation.

Policy Studio lifecycle:

1. Draft.
2. Simulate on sample or historical actions.
3. Review diff/conflict warnings.
4. Activate an immutable version.
5. Edit by creating a new version.
6. Roll back by re-activating an older published version.

Historical receipts keep the exact `policy@version` references used at evaluation time.

## Human Review

Review cases support assignment, internal comments, evidence requests, provenance-aware evidence additions, rationale-backed approve/reject actions, due/age tracking, and revision conflicts.

Approval or rejection does not mutate the original receipt. The action is recorded as evidence, VetoLayer re-runs the real orchestrator, and a new receipt is added to lineage.

## Troubleshooting

- `401`: confirm the project key is active and sent as a bearer token.
- `403`: confirm key permission and scope; clients cannot override scope.
- `429`: honor `Retry-After`.
- SERV/contextual provider failure: inspect provider trace and integration health. Failure is fail-closed and cannot become `ALLOW`.
- GitHub disconnected/stale: reconnect the installation and refresh repository state in Integrations.
- `SETTINGS_CONFLICT` or `REVIEW_CONFLICT`: refresh and intentionally retry from the newest state.
- Production persistence unavailable: fix server configuration; memory persistence is development-only.

## Security boundaries

Public documentation never includes real API keys, webhook signing secrets, provider secrets, Supabase service-role credentials, prompts/responses, or private evidence values. Provider registration credentials remain server-side deployment configuration.

## Release notes

See `docs/releases/2026-09.md` or Dashboard → Documentation → Release notes.

# VetoLayer Developer API

The Developer API is the framework-agnostic product boundary for evaluate-before-execute integrations. The GitHub gate is one adapter; `/api/v1/evaluate` works with any action that satisfies the core contracts.

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

The endpoint runtime-validates all core objects, runs `evaluateAction(...)`, executes deterministic rules first, calls SERV only when contextual policy is applicable, creates a tamper-evident Decision Receipt, and stores that receipt using the configured decision store.

A successful response includes:

- `requestId`
- normalized `decision`
- `receipt`
- decision `trace`
- optional SERV `providerTrace`
- current persistence mode

The endpoint never turns provider failure into ALLOW; contextual provider/configuration failure is handled by the existing orchestrator and escalates to REVIEW.

## Fetch status

`GET /api/v1/decisions/:receiptId`

Returns the decision id, current outcome, summary, timestamp, complete Decision Receipt, source, and persistence mode for the requested workspace.

## Workspace and authentication

Use `X-VetoLayer-Workspace` to scope persisted receipts. In hosted environments set `VETOLAYER_API_KEY`; when configured, all `/api/v1/*` calls require:

```text
Authorization: Bearer <VETOLAYER_API_KEY>
```

Rate limiting is configured with `VETOLAYER_API_RATE_LIMIT_PER_MINUTE`.

## Error model

Errors always use the shape:

```json
{
  "error": {
    "code": "INVALID_ACTION",
    "message": "Action Request does not satisfy the VetoLayer contract.",
    "details": []
  }
}
```

Common codes include `INVALID_JSON`, `INVALID_ACTION`, `POLICIES_REQUIRED`, `INVALID_POLICY`, `INVALID_EVIDENCE`, `INVALID_FACTS`, `INVALID_ENVIRONMENT`, `UNAUTHORIZED`, `RATE_LIMITED`, `EVALUATION_FAILED`, `DECISION_NOT_FOUND`, and `DECISION_STORE_UNAVAILABLE`.

## SDK boundary

`@vetolayer/sdk` intentionally exposes only a tiny client and `guardedToolCall(...)`. It does not own policy evaluation and does not bundle an agent framework. The server remains the source of truth.

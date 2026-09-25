# Decision Explorer and Receipt Center

Issue #60 replaces the old recent-events list with the production investigation surface for VetoLayer Decision Receipts.

## Storage and search model

The signed `receipt` JSON remains the source of truth and is never rewritten for indexing. Migration `202609251500_decision_explorer.sql` adds derived columns to `vetolayer_decisions` for scalable server-side search and filtering: receipt/decision/request IDs, action/tool, actor, target, outcome, SERV usage, logical and versioned policy references, review state, review case, parent receipt, and normalized search text.

The indexes are rebuildable from the signed receipt. They are not part of receipt integrity and cannot change the historical meaning of a decision.

Production queries use exact PostgREST counts and explicit page/page-size values. The UI never treats a fixed-size recent fetch as the full result set.

## Explorer query state

`/dashboard/decisions` supports URL-backed filters for:

- free-text search across receipt ID, decision ID, request/action, actor, resource, policy ID/name, and summary
- outcome
- project and environment
- source (`integration`, `api`, or `demo`)
- integration/tool name such as `github`
- logical policy ID
- SERV used / deterministic-only
- operational review state
- date range
- sort order and page size

Because the query is encoded in the URL, opening a receipt and returning to the explorer preserves the investigation. Named saved views are stored locally per workspace in the browser; they do not create server-side shared configuration or hidden policy behavior.

## Receipt Center

A receipt deep link is stable by receipt ID and also supports decision-ID lookup. Production detail lookup is workspace-wide rather than dependent on whichever project/environment happens to be selected in the sidebar.

The Receipt Center shows:

- action, actor, target, source, project/environment, timestamps, and schema/orchestrator versions
- exact policy versions embedded in the signed receipt
- deterministic and SERV findings
- evidence, provenance, embedded data, verification state, missing evidence, and contradictions
- exception path and requirements needed to change the outcome
- execution trace and provider metadata
- linked human-review timeline and reviewer actions
- cryptographic SHA-256 integrity status
- every receipt sharing the same signed `action.requestId` as a lineage
- side-by-side semantic comparison between lineage receipts

Review re-evaluations save a new receipt first, record its `parent_receipt_id`, and then link it into the review workflow. Earlier receipts are never overwritten.

## Integrity verification

`POST /api/decisions/:receiptId/verify` re-runs `verifyDecisionReceipt(...)` against the signed receipt content and returns the verification result. Demo fixtures are labeled as such rather than represented as cryptographically verified production receipts.

## Exports

`GET /api/decisions/:receiptId/export?format=json` returns the exact signed receipt JSON.

`GET /api/decisions/:receiptId/export?format=text` returns a human-readable incident-review report with decision findings, scope, integrity status, evidence summary, lineage metadata, and linked review timeline.

Before export, VetoLayer recursively checks the receipt for credential-shaped field names such as authorization headers, API keys, access tokens, private keys, client/webhook secrets, and passwords. If one is present, export fails closed instead of serializing it. Provider metadata shown in the UI is also redacted for credential-shaped keys.

Exports use authenticated workspace authorization and `Cache-Control: private, no-store`.

## Operational review indexing

Review status is derived metadata. When a review is created or changes state, VetoLayer best-effort annotates every successfully linked receipt in that review lineage with the current `review_state` and `review_case_id` so Decision Explorer review filters remain accurate.

The authoritative review mutation does not depend on this secondary search index: if index annotation fails, the review succeeds and the failure is logged for repair instead of losing reviewer work.

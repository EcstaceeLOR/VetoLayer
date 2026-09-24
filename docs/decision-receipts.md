# VetoLayer Decision Receipts

A Decision Receipt is the durable record of what VetoLayer decided and the evidence chain behind it.

Receipts are generated from the real orchestrator result in `@vetolayer/core`; the frontend does not manufacture or reinterpret them.

## What a receipt records

- receipt and decision IDs
- proposed action and target
- agent/human/service identity
- final `ALLOW | REVIEW | BLOCK` outcome
- decision summary
- evaluated policy snapshots
- deterministic findings
- SERV contextual findings
- evidence actually referenced by findings
- missing evidence
- contradictory evidence
- declared exception paths for evaluated policies and their related findings
- guidance describing what would need to change
- action, decision, and receipt timestamps
- complete orchestrator step trace
- contextual provider trace, including SERV metadata when available
- receipt/orchestrator schema versions
- SHA-256 integrity marker

## Integrity model

Before hashing, VetoLayer recursively sorts object keys and serializes the receipt content into canonical JSON. It then computes a SHA-256 digest over that content.

The integrity block itself is excluded from the hashed payload:

```json
{
  "algorithm": "SHA-256",
  "hash": "..."
}
```

`verifyDecisionReceipt(receipt)` repeats canonicalization and hashing and returns `false` if any hashed field has changed.

This is tamper-evidence, not external notarization. VetoLayer does not claim that the current MVP hash proves who stored the receipt or when it was first published.

## Human and machine views

`renderDecisionReceiptSummary(receipt)` produces concise plain text suitable for a reviewer or UI detail pane.

`decisionReceiptToJson(receipt)` produces the full stable machine-readable record.

## Privacy boundary

Receipts store evidence objects that were actually referenced by findings. Integrations should avoid placing secrets in evidence payloads. Secret values such as SERV API keys are never part of the receipt model.

## Out of scope

The MVP does not use blockchain storage, external timestamping/notarization, compliance certification, or third-party audit services. Those can be added later without changing the core receipt purpose.

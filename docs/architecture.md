# VetoLayer Architecture

This document is the architectural contract for the MVP.

## Core principle

VetoLayer separates **enforcement** from **judgment**.

- Deterministic policies handle facts and hard constraints that should always produce the same result for the same input.
- SERV Reasoning handles contextual policies that require evidence comparison, interpretation, exception analysis, or uncertainty.
- The core orchestrator combines both without allowing contextual reasoning to override a hard deterministic block.

## Fixed request flow

```text
1. Action Request
      ↓
2. Resolve applicable policies
      ↓
3. Deterministic checks
      ├── Hard BLOCK → BLOCK
      └── Continue
              ↓
4. Does any applicable policy require contextual judgment?
      ├── No
      └── Yes → SERV Reasoning
                    ↓
5. Combine structured findings
      ↓
6. ALLOW / REVIEW / BLOCK
      ↓
7. Decision Receipt
      ↓
8. Calling integration decides whether the proposed tool action may proceed
```

## Package boundaries

### `apps/web`
Owns the product interface and HTTP/API surface. It may call core services but must not reimplement decision logic in UI components.

### `packages/core`
Owns provider-agnostic domain contracts, decision orchestration, and receipt generation. Core code must not import Next.js, GitHub-specific code, or SERV-specific response types.

### `packages/policies`
Owns deterministic policy evaluation. It must not call an LLM or SERV. If a policy requires semantic/contextual judgment, it returns a structured handoff rather than guessing.

### `packages/serv`
Owns the SERV Reasoning adapter. It translates a normalized contextual judgment request into SERV calls and validates the structured response before returning it to core.

### `examples/github-gate`
Owns the first real adapter. It gathers GitHub/deployment evidence and translates a proposed coding-agent action into the core `ActionRequest` contract.

## Decision safety invariants

1. A hard deterministic `BLOCK` cannot be overridden by SERV.
2. A missing critical piece of evidence cannot silently become `ALLOW`.
3. A SERV/provider failure must degrade safely to `REVIEW`, not `ALLOW`.
4. UI state is never the source of truth for a decision.
5. Every decision must be reconstructable from structured findings as Decision Receipts are implemented.

## MVP architecture boundary

Do not add microservices, Kubernetes, Terraform, Helm, blockchain storage, or additional agent frameworks unless a later product requirement proves they are necessary. VetoLayer is one product with one clear decision pipeline.

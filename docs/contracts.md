# VetoLayer core contracts

VetoLayer's core contracts are provider-agnostic. They describe what an autonomous actor wants to do, the policies governing that action, the evidence available at decision time, and the resulting decision.

## ActionRequest

An `ActionRequest` is the normalized input to VetoLayer. Every integration converts a proposed action into this shape before policy evaluation.

Required concepts:
- request id
- actor identity and actor kind
- action type, tool, operation, and arguments
- target resource
- context
- requested timestamp

The model intentionally does not contain GitHub-specific or SERV-specific fields.

## Policy

Policies have common metadata and one of two modes.

### Deterministic policy

Use when the condition can be evaluated reproducibly from structured data. Examples include permission checks, fixed thresholds, required approvals, blocked environments, and explicit deny rules.

A deterministic rule has an effect (`allow`, `review`, or `block`), a match mode (`all` or `any`), and structured conditions.

### Contextual policy

Use when deciding the policy requires semantic judgment over context, evidence, exceptions, or competing facts. These policies contain a plain-language instruction and explicit decision criteria. Issue #4 connects this mode to SERV Reasoning.

Policies may declare required evidence and named exceptions. Exceptions are data, not hidden prompt behavior.

## Evidence

Evidence is a typed observation or reference used to support a decision. It includes:
- source
- evidence type
- data and/or a stable reference
- observation time
- optional expiry
- verification state

Evidence without either data or a reference is rejected.

## Decision

A `Decision` is the normalized result of evaluation:
- `ALLOW`
- `REVIEW`
- `BLOCK`

It includes deterministic findings, contextual findings, missing evidence, contradictions, applied policies, an optional confidence value, a summary, and the decision timestamp.

The Decision is not yet the full audit artifact. Issue #6 turns this information into a tamper-evident Decision Receipt.

## Validation

All external data is parsed through Zod schemas exported from `@vetolayer/core`. Schemas are strict: unknown top-level or nested fields are rejected where defined, enum states are closed, and TypeScript types are inferred from the runtime schemas.

Representative examples are included for:
- production deployment
- pull-request merge
- customer refund
- vendor payment

This keeps the core model horizontal while allowing the initial GitHub/deployment integration to remain the flagship product wedge.

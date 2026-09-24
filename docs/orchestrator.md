# VetoLayer decision orchestrator

The orchestrator in `@vetolayer/core` is the single place where deterministic enforcement and contextual SERV judgment are combined into a final decision.

## Why adapters are injected

`@vetolayer/policies` and `@vetolayer/serv` both depend on the provider-agnostic contracts in `@vetolayer/core`. If core imported those packages directly, the monorepo would contain circular package dependencies.

Instead, core defines small adapter interfaces and receives the concrete evaluators at composition time. This preserves the architecture while keeping the final decision precedence rules centralized.

## Public API

```ts
const result = await evaluateAction(input, {
  evaluateDeterministic,
  evaluateContextual,
})
```

or:

```ts
const vetoLayer = createDecisionOrchestrator({
  evaluateDeterministic,
  evaluateContextual,
})

const result = await vetoLayer.evaluate(input)
```

## Decision path

```text
Action Request
  -> policy-resolution trace
  -> deterministic evaluation
  -> hard BLOCK? stop
  -> applicable contextual policies?
  -> SERV contextual evaluation
  -> combine findings
  -> ALLOW / REVIEW / BLOCK
  -> Decision payload + execution trace
```

## Precedence rules

1. An explicit deterministic hard BLOCK cannot be overridden.
2. A contextual BLOCK also produces BLOCK unless a prior hard block already ended evaluation.
3. Missing evidence required by a critical policy can never result in ALLOW.
4. A SERV/provider failure is treated as REVIEW, never ALLOW.
5. Conflicting high/critical findings escalate to REVIEW unless a BLOCK already applies.
6. Any deterministic or contextual REVIEW remains REVIEW unless a BLOCK applies.
7. ALLOW is returned only when every applicable path safely permits the action.

## Traceability

The result includes a trace of four possible stages:

- `policy-resolution`
- `deterministic-evaluation`
- `contextual-evaluation`
- `decision-combination`

Each step records whether it completed, was skipped, or used a fallback and explains why. The contextual provider trace is also preserved separately so later Decision Receipts can include SERV request metadata.

## Architectural boundary

The orchestrator contains no UI or GitHub-specific logic. It does not execute external actions. It only determines whether a proposed action should be ALLOW, REVIEW, or BLOCK and returns the structured facts needed for the next layer.

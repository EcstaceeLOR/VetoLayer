# Deterministic Policy Engine

`@vetolayer/policies` evaluates rules that can be decided without model judgment.

Its responsibility is intentionally narrow: deterministic rules are enforced here; semantic ambiguity, policy interpretation, and exception reasoning are routed to SERV later.

## Evaluation flow

```text
Action Request
  -> discard disabled / out-of-scope policies
  -> verify mandatory evidence and freshness
  -> evaluate deterministic conditions
  -> short-circuit explicit BLOCK
  -> surface REVIEW when required
  -> route contextual policy IDs onward
```

## Evaluation input

The evaluator receives:

- a validated `ActionRequest`
- validated policies
- optional verified evidence
- optional deterministic runtime facts
- an optional evaluation time for reproducible tests

Runtime facts are integration-supplied facts that are safe to compare deterministically, for example:

```ts
{
  permissions: {
    canDeployProduction: true
  },
  approvals: 2,
  emergency: false
}
```

Policies can reference action fields or facts by path, for example:

- `action.actor.id`
- `action.action.tool`
- `action.action.arguments.amount`
- `action.target.environment`
- `action.context.attributes.changeRisk`
- `facts.permissions.canDeployProduction`

## Supported operators

- `equals`
- `not_equals`
- `greater_than`
- `greater_than_or_equal`
- `less_than`
- `less_than_or_equal`
- `in`
- `not_in`
- `exists`
- `not_exists`

`greater_*` and `less_*` operators require numeric values. `in` and `not_in` require an array as the configured comparison value. Invalid deterministic configuration fails safely to `REVIEW` rather than silently allowing an action.

## Evidence behavior

A required evidence item is satisfied only when:

1. the evidence type matches the requirement,
2. verification status is `verified`,
3. the evidence is not expired,
4. the evidence is not observed in the future, and
5. `maxAgeSeconds`, when configured, has not been exceeded.

Missing or stale required evidence escalates the deterministic result to `REVIEW` unless an explicit hard BLOCK already applies.

## Outcomes

The engine returns a provisional deterministic outcome:

- `ALLOW` — no deterministic blocker or review requirement exists,
- `REVIEW` — a rule explicitly requires review, evidence is missing/stale, or rule configuration cannot be evaluated safely,
- `BLOCK` — an explicit deterministic deny rule matched.

`hardBlock: true` means the caller must not allow SERV or any later layer to override the block.

## Contextual policies

Contextual policies are never interpreted by this package. Applicable contextual policy IDs are returned in `contextualPolicyIds` for the SERV reasoning layer.

This is a core architectural invariant: **no LLM or SERV call belongs inside `@vetolayer/policies`.**

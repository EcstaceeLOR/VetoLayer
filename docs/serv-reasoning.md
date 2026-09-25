# SERV Reasoning integration

VetoLayer uses SERV only for contextual judgment: situations where a policy requires interpretation of context, evidence, exceptions, or ambiguity. Deterministic restrictions remain in `@vetolayer/policies`.

## Runtime path

```text
Action Request
  -> deterministic findings
  -> applicable contextual policies
  -> evidence + environment context
  -> @vetolayer/serv
  -> OpenServ SERV Reasoning
  -> validated contextual judgment
  -> ALLOW / REVIEW / BLOCK recommendation
```

The adapter calls OpenServ through its OpenAI-compatible chat-completions interface. The default base URL is:

```text
https://inference-api.openserv.ai/v1
```

The base URL remains configurable through `SERV_BASE_URL` so the application is not coupled to an endpoint string if OpenServ changes or provisions a project-specific URL.

## Required configuration

```text
SERV_API_KEY=...
SERV_MODEL=...
SERV_BASE_URL=https://inference-api.openserv.ai/v1
SERV_TIMEOUT_MS=20000
```

All values are server-only. They must never be exposed through `NEXT_PUBLIC_*` variables.

## Input bundle

SERV receives only a normalized bundle containing:

- proposed `ActionRequest`
- applicable contextual policies
- deterministic findings already produced by VetoLayer
- supplied evidence
- relevant environment/context

Evidence and action text are explicitly framed as untrusted data so instructions embedded inside them are not treated as system instructions.

## Validated output

SERV must return a JSON decision containing:

- `recommendedOutcome`: `ALLOW | REVIEW | BLOCK`
- policy-by-policy findings
- evidence IDs actually used
- missing evidence
- contradictory evidence
- exception analysis
- concise rationale
- optional confidence score

VetoLayer validates this response with Zod before allowing it into core decision logic.

## Grounding checks

Schema-valid output is not enough. The adapter rejects reasoning that references:

- a policy that was not supplied
- evidence that was not supplied
- contradiction evidence IDs that do not exist in the input bundle

This prevents a fluent but ungrounded response from being accepted as a valid judgment.

## Fail-safe behavior

SERV failures never silently become `ALLOW`.

The following all produce a fallback `REVIEW` decision:

- missing credentials/model configuration
- network failure or timeout
- non-success HTTP response
- malformed response body
- invalid decision schema
- ungrounded policy/evidence references

The fallback is marked with `providerStatus: "fallback"` and a typed error code so the orchestrator and UI can distinguish genuine SERV reasoning from a safe escalation.

## Audit/debug metadata

Every successful or fallback evaluation records:

- provider: `openserv-serv`
- endpoint
- model
- provider request ID when available
- latency
- timestamp
- provider status
- prompt/completion/total token counts when returned

This metadata exists so VetoLayer can visibly show that SERV performed the contextual judgment and later preserve the trace inside Decision Receipts.

## Architectural boundary

`@vetolayer/serv` does not execute tools, mutate external systems, or override deterministic hard blocks. It provides contextual judgment only. The final precedence rules are enforced by the core orchestrator in Issue #5.

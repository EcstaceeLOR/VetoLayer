# VetoLayer GitHub Gate

This is VetoLayer's first real integration: a pre-action gate for autonomous coding agents operating against GitHub.

It evaluates a proposed action before execution and returns:

- `ALLOW` — the integration may proceed with the requested action
- `REVIEW` — pause and require human intervention or better evidence
- `BLOCK` — refuse the action

The gate itself does **not** auto-merge or deploy. Execution remains a separate capability so a consumer cannot accidentally bypass the VetoLayer decision boundary.

## Supported action intents

- `merge-pull-request`
- `deploy-production`
- `modify-protected-configuration`
- `security-sensitive-change`

## Evidence collected from GitHub

The real REST client collects:

- pull request metadata
- changed files
- human review states
- check-run / CI status

The adapter converts these into VetoLayer `Evidence` plus deterministic facts such as approval count, CI state, draft state, changed-file count, and whether sensitive paths are touched.

Sensitive-path detection currently includes authentication, security, middleware, infrastructure, GitHub workflow, secret, and permission areas.

## Real evaluation

```ts
import { evaluateGitHubPullRequest } from "@vetolayer/github-gate";

const result = await evaluateGitHubPullRequest({
  owner: "acme",
  repo: "api",
  pullRequest: 42,
  githubToken: process.env.GITHUB_TOKEN!,
  operation: "merge-pull-request",
});

console.log(result.orchestration.decision.outcome);
console.log(result.receipt.integrity.hash);
```

This call:

1. retrieves current GitHub evidence
2. builds an `ActionRequest`
3. executes deterministic VetoLayer policies
4. invokes SERV for contextual judgment when required
5. combines the findings through the core orchestrator
6. generates a tamper-evident Decision Receipt

## Default policy pack

The example ships with four production-shaped policies:

1. draft pull requests are hard-blocked
2. CI must be successful or the action requires review
3. at least one current human approval is required
4. sensitive changes receive SERV contextual judgment

The contextual policy is especially important for cases where a simple boolean rule is insufficient—for example protected configuration or authentication changes during a restricted deployment window, including a documented critical-security-remediation exception.

## Environment

The caller supplies `GITHUB_TOKEN` to the GitHub client. SERV uses the server-only variables documented in the root `.env.example`:

```text
SERV_API_KEY
SERV_MODEL
SERV_BASE_URL
SERV_TIMEOUT_MS
```

Never expose GitHub or SERV credentials to browser code.

## Integration boundary

GitHub-specific logic stays entirely under `examples/github-gate`. `@vetolayer/core`, `@vetolayer/policies`, and `@vetolayer/serv` remain reusable for finance, support, procurement, or any other future VetoLayer integration.

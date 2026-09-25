# VetoLayer

**VetoLayer is the reasoning and approval layer for high-impact AI agent actions.**

It sits between an autonomous agent and the tools that can change production, move money, alter permissions, affect customers, or trigger other consequential operations. Deterministic policy runs first. SERV Reasoning handles genuine ambiguity. Human Review resolves what remains uncertain. Every verdict produces an auditable Decision Receipt.

## Live product

- Product: https://vetolayer.vercel.app
- Repository: https://github.com/EcstaceeLOR/VetoLayer

## Why VetoLayer exists

Traditional access control answers whether an agent *can* call a tool. VetoLayer answers whether it *should* execute a specific action now, given policy, evidence, environment, risk, and current context.

That distinction matters when an agent proposes actions such as:

- merging or deploying production code;
- issuing a refund or credit;
- purchasing or approving spend;
- changing permissions or protected configuration;
- modifying infrastructure;
- invoking another high-impact tool.

## Decision model

Every action follows the same control path:

1. **Action proposal** — an agent submits a structured action request.
2. **Deterministic policy** — hard rules evaluate permissions, thresholds, protected environments, required evidence, and explicit denies.
3. **Contextual reasoning** — SERV Reasoning is invoked only when policy interpretation genuinely needs context.
4. **Human Review** — unresolved actions become REVIEW cases with evidence, assignment, comments, and re-evaluation.
5. **Decision Receipt** — ALLOW, REVIEW, or BLOCK returns with findings, evidence, trace metadata, policy versions, lineage, timestamps, and integrity data.

Hard deterministic BLOCK findings remain authoritative. Provider failures, malformed reasoning output, and missing critical evidence never silently become ALLOW.

## Product surfaces

VetoLayer is a complete operational product rather than a single evaluation endpoint.

- **Control Center** — live workspace status, decision health, activity, integration state, and operational actions.
- **Policy Studio** — templates, versioned drafts, safe activation, simulation, diffs, duplication, archive, and lifecycle controls.
- **Human Review** — assignment, comments, evidence requests, evidence additions, resolution, and policy re-evaluation with receipt lineage.
- **Decision Explorer / Receipt Center** — indexed search, filters, saved views, pagination, integrity verification, lineage, comparison, JSON export, and incident export.
- **Integrations** — GitHub App setup, health, configuration, webhook processing, and protected-operation evaluation.
- **Developer Console** — scoped API keys, SDK setup, request testing, webhook endpoints, signing-secret rotation, delivery history, and retries.
- **Notifications** — in-product alerts, user preferences, email workflow notifications, and signed outbound webhooks.
- **Analytics** — operational decision metrics, SERV usage, review throughput, policy outcomes, and export.
- **Audit Log** — security-sensitive activity with searchable and exportable history.
- **Settings** — workspace, security, retention, integrations, notification preferences, and operational configuration.
- **Plan & Usage** — real workspace usage and server-enforced product entitlements.
- **Data & Offboarding** — safe exports, integrity hashes, ownership transfer, retention controls, delayed workspace removal, and account offboarding.
- **Product Docs** — in-product guides for the API, SDK, policies, reviews, GitHub integration, webhooks, troubleshooting, and releases.

## Architecture

```text
Agent / Application
        |
        v
VetoLayer SDK or POST /api/v1/evaluate
        |
        v
Authentication + workspace/project/environment scope
        |
        v
Deterministic policy engine
        |
        +---- explicit BLOCK ----------------------+
        |                                          |
        v                                          |
Context required?                                  |
   | no                                            |
   +-------------------------------+               |
   |                               |               |
   yes                             |               |
   v                               |               |
SERV Reasoning                     |               |
   |                               |               |
   v                               v               v
ALLOW / REVIEW / BLOCK ------> Decision Receipt + lineage
                                  |
                                  +--> Human Review when required
```

The monorepo is split into focused packages:

- `packages/core` — schemas, orchestration, receipts, review evidence, parsing.
- `packages/policies` — deterministic policy evaluation.
- `packages/serv` — SERV Reasoning client, prompt contract, provider parsing, failure handling.
- `packages/sdk` — TypeScript client and guarded-tool-call helpers.
- `examples/github-gate` — GitHub protected-operation adapter and safety evaluation suite.
- `apps/web` — production web application, APIs, dashboards, auth, workspace model, operations, and docs.

## Developer quickstart

### Install

```bash
pnpm install
```

### Configure

Copy the root environment template and provide the required values for your environment.

```bash
cp .env.example .env.local
```

Production deployments require durable Supabase-backed persistence, production authentication configuration, SERV credentials, and the runtime secrets documented in `docs/deployment.md`.

### Run locally

```bash
pnpm dev
```

### Evaluate an action

Create a scoped API key in **Developer Console**, then call:

```bash
curl -X POST "$VETOLAYER_URL/api/v1/evaluate" \
  -H "Authorization: Bearer $VETOLAYER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": {
      "requestId": "req_123",
      "type": "tool_call",
      "tool": "github",
      "operation": "deploy-production",
      "target": "identity-api",
      "environment": "production"
    },
    "actor": {
      "id": "agent_release",
      "kind": "agent",
      "name": "Release Agent"
    },
    "evidence": []
  }'
```

The response contains the verdict and signed receipt metadata. Your application should execute the underlying tool only when the outcome is `ALLOW`.

## TypeScript SDK

```ts
import { createVetoLayerClient, guardedToolCall } from "@vetolayer/sdk";

const veto = createVetoLayerClient({
  baseUrl: process.env.VETOLAYER_URL!,
  apiKey: process.env.VETOLAYER_API_KEY!,
});

const result = await guardedToolCall({
  client: veto,
  evaluation,
  execute: () => highImpactToolCall(),
});
```

## Human Review safety model

REVIEW is a first-class decision state. A reviewer does not bypass policy by pressing an approval button.

When a reviewer resolves a case:

1. the review action becomes structured evidence;
2. VetoLayer re-runs the evaluation pipeline;
3. deterministic policy remains authoritative;
4. SERV is invoked again when contextual reasoning is required;
5. a new Decision Receipt is produced;
6. the new receipt references its parent so the original decision is preserved.

This makes human judgment auditable without turning it into an unrestricted override.

## Decision Receipts

Receipts capture the information needed to investigate and reproduce a decision:

- action and actor identity;
- workspace, project, and environment scope;
- exact managed policy versions;
- deterministic findings;
- SERV findings and trace metadata;
- evidence used, missing evidence, and contradictions;
- Human Review evidence when present;
- requirements for changing the outcome;
- request/receipt lineage;
- SHA-256 integrity metadata.

Search indexes are derived metadata. The signed receipt itself is not rewritten for indexing.

## Security and failure behavior

VetoLayer is intentionally fail-closed around consequential actions.

- Deterministic BLOCK cannot be overruled by contextual reasoning.
- SERV transport/provider failures fall back to safe non-ALLOW outcomes.
- Production workspace identity is resolved server-side.
- API keys are scoped to project/environment permissions.
- Webhook payloads are signed and exclude server secrets.
- Sensitive exports fail closed on credential-shaped fields.
- Destructive workspace operations use explicit confirmation and delayed removal.
- Production persistence requirements are enforced rather than silently falling back to process memory.

## Reliability and QA

The repository release gate includes:

```bash
pnpm production:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e:browser
pnpm release:smoke
```

The browser suite runs against a compiled `next start` build with real headless Chrome. It covers authentication/onboarding seams, dashboard routes, API-key lifecycle, policy flows, provider degradation, Human Review re-evaluation, receipt behavior, global recovery states, console cleanliness, and explicit performance budgets.

`pnpm production:check` scans every tracked repository path and text file and fails if legacy sandbox naming is reintroduced.

Production exposes separate liveness and readiness endpoints:

- `/api/health` — process/liveness signal.
- `/api/readiness` — verifies mandatory production dependencies are actually ready.

A scheduled **Production Smoke** workflow verifies the deployed product independently of the build pipeline.

## Database

Supabase migrations live under `supabase/migrations/` and cover:

- workspaces, projects, environments, membership, invitations, and roles;
- onboarding state;
- GitHub App installations/configuration;
- Developer Console credentials and webhook endpoints;
- policy lifecycle/versioning;
- audit log;
- operational Human Review;
- Decision Explorer indexes and lineage;
- notifications and delivery state;
- settings/retention;
- commercial plans;
- export and offboarding jobs.

Apply migrations in timestamp order to the production Supabase project before release.

## Documentation

Start with:

- `docs/product-guide.md`
- `docs/deployment.md`
- `docs/developer-api.md`
- `docs/developer-console.md`
- `docs/policy-studio.md`
- `docs/human-review.md`
- `docs/decision-explorer.md`
- `docs/github-app.md`
- `docs/notifications.md`
- `docs/release-checklist.md`

The same operational documentation is available inside the product at `/dashboard/docs`.

## SERV Hackathon Edition 01

VetoLayer is submitted to the Open Track as a production control layer built on SERV Reasoning. The product uses SERV only for contextual judgment that deterministic policy cannot settle safely; it does not delegate hard safety rules to a model.

Judge-facing submission material is maintained in:

- `docs/submission.md`
- `docs/production-walkthrough.md`
- `docs/x-submission-post.md`
- `docs/release-checklist.md`

## License / repository status

This repository is the source of truth for the VetoLayer product and its release evidence. Production releases should be made only from a commit that passes the complete CI, browser, repository-cleanliness, and release-smoke gates.

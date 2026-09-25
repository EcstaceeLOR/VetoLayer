<p align="center">
  <img src="docs/brand/vetolayer-lockup.svg" alt="VetoLayer" width="520" />
</p>

# VetoLayer

**Agents can think freely. They shouldn't act freely.**

> **VetoLayer is a pre-execution reasoning and approval layer for autonomous AI agents.** It evaluates a proposed high-impact action against deterministic rules, contextual policy, evidence, exceptions, and current state before the action reaches the real world.

**SERV Hackathon:** Edition 01 · Open Track  
**Decision:** `ALLOW | REVIEW | BLOCK`  
**Audit artifact:** tamper-evident Decision Receipt with SHA-256 integrity metadata  
**Initial market wedge:** AI coding and deployment agents  
**Public product URL:** https://vetolayer.vercel.app

> Release status for judges: the repository's latest product gate is green. A fresh Production Smoke against the latest deployed `main` remains the final closure check in Issue #12 because the Vercel account is currently rate-limited from creating another deployment.

## 60-second judge view

Autonomous agents increasingly have credentials that let them merge code, deploy production, issue refunds, change protected configuration, and call other consequential tools. Traditional authorization answers **can this agent act?** VetoLayer answers **should this agent act right now?**

VetoLayer evaluates every proposed action in two layers:

1. **Deterministic policy first** — hard limits, protected environments, required evidence, freshness rules, and explicit denies stay reproducible.
2. **SERV Reasoning when judgment is actually required** — ambiguous policy language, exceptions, conflicting evidence, incident context, and unresolved conditions are evaluated contextually.

The orchestrator combines those findings into `ALLOW`, `REVIEW`, or `BLOCK`. SERV cannot override an explicit deterministic hard `BLOCK`, and missing/invalid contextual reasoning cannot silently become `ALLOW`; provider or schema failure safely degrades to `REVIEW`.

Every evaluation produces a Decision Receipt containing the action, actor, scope, exact policy versions, deterministic/SERV findings, evidence, missing or contradictory evidence, exception path, reasoning trace, timestamps, lineage, provider status, and an integrity hash.

## Why SERV is central

SERV is not used as a decorative model call or chatbot. `@vetolayer/serv` receives a normalized contextual bundle containing:

- the proposed action and actor;
- applicable contextual policy versions;
- deterministic findings that already resolved hard facts;
- verified evidence and freshness metadata;
- environment/incident context;
- exception requirements and contradictions.

SERV must return structured policy findings, evidence usage, missing/contradictory evidence, exception analysis, rationale, confidence, and an outcome recommendation. VetoLayer schema-validates and grounds the result before the core orchestrator can use it.

This split is the product thesis:

> **Deterministic facts stay deterministic. Contextual judgment goes to SERV. Final authority stays inside VetoLayer core.**

See [`docs/serv-reasoning.md`](docs/serv-reasoning.md).

## The control path

```text
Autonomous Agent
      ↓
Proposed Action
      ↓
VetoLayer scope + policy resolution
      ↓
Deterministic Policy Engine
      ├── hard restriction / factual result ───────────┐
      └── contextual policy needs judgment            │
                              ↓                         │
                         SERV Reasoning                 │
                              ↓                         │
                    ALLOW / REVIEW / BLOCK ◄────────────┘
                              ↓
                       Decision Receipt
                              ↓
          execute / hold for review / prevent action
```

## Flagship product workflow

The flagship scenario is an autonomous coding agent proposing an **authentication/security production deployment during a restricted change window**.

- A critical security incident exists.
- The patch changes sensitive auth paths.
- CI/security checks pass.
- The policy allows an emergency exception only when the incident and the correct human approval are verified.
- Security-lead approval is initially missing.

The first evaluation returns **`REVIEW`** because the exception is not sufficiently supported. A reviewer adds the missing evidence inside the real Human Review workflow; VetoLayer creates a new immutable receipt and re-evaluates the same action through deterministic policy + SERV + the orchestrator. Only then can the action become **`ALLOW`**.

Human review is therefore **evidence**, not an out-of-band bypass.

For judges who want a no-account proof surface, `/demo` remains an explicitly labelled public sandbox using seeded scenario inputs with the same real evaluation/orchestration/receipt code paths. The product itself does not depend on `/demo`.

See [`docs/demo-script.md`](docs/demo-script.md).

## Finished product surface

| Surface | Shipped capability |
| --- | --- |
| Public site + auth | Product landing, pricing, sign-in, recovery, verification, and account security flows. |
| Onboarding | Create/select workspace, project and environment; connect GitHub or Developer API; install a starter policy pack; verify SERV; run a real test action. |
| Workspaces / RBAC | Workspace, project, environment, member and role administration with server-side authorization. |
| GitHub integration | GitHub App installation, repository selection, webhook verification, short-lived installation credentials, and real PR/check/review evidence. |
| Developer Console | Scoped API keys, rotation/revocation, signed webhook endpoints, delivery history/retry, SDK setup, and live request tester. |
| Policy Studio | Drafts, templates, versioning, diffs, simulation, activation, archive, and exact policy-version references. |
| Human Review | Queue, assignment, comments, evidence requests, evidence submission, re-evaluation, timeline, due state, and receipt lineage. |
| Decision Explorer / Receipt Center | Indexed search, filters, saved views, exact pagination, integrity verification, lineage, comparison, JSON export, and incident export. |
| Notifications | In-product alerts, email preferences, project subscriptions, signed outbound webhooks, retries/backoff, deduplication, and delivery history. |
| Security Audit | Append-only actor/action/target history, correlation IDs, filters, deep links, redaction, and authorized export. |
| Operational Analytics | Outcome trends, policy friction, review turnaround/aging, evidence health, SERV ratios, re-evaluation outcomes, integration reliability, drill-downs, CSV/JSON reports. |
| Settings / Data | Workspace administration, retention, concurrency protection, safe export, ownership transfer, offboarding, and delayed destructive jobs. |
| Plans / Usage | Real usage meters and server-enforced project, seat and decision entitlements; no fake checkout. |
| Docs / Help | In-product documentation, stable developer guides, webhook reference, troubleshooting, contextual help, and release notes. |
| Reliability | Readiness vs liveness, request correlation, sanitized error capture, recovery boundaries, browser E2E, performance budgets, production smoke workflow, and strict route/console QA. |

The final product-completion program (#49) is complete; every child issue #50–#69 is closed.

## Why this is creative

VetoLayer uses reasoning as an **enforcement boundary**, not a chat interface. It deliberately combines two kinds of control that normally get conflated:

- deterministic policy for facts and non-negotiable restrictions;
- contextual SERV judgment for exceptions and ambiguous evidence.

That lets the system remain fail-closed without pretending every governance decision is reducible to static thresholds.

## Why this is user-ready

A user can sign up, create a workspace/project/environment, connect GitHub or the Developer API, activate a policy, submit an action, receive a decision, resolve `REVIEW`, and inspect the resulting receipt without editing code or reading repository internals.

Returning users get durable/searchable product state, analytics, audit history, notifications, settings, data lifecycle controls, and developer tooling.

## Revenue path

The beachhead is **AI coding and deployment agents**, where teams want more autonomy without giving agents unchecked authority over production.

```text
Engineering       → deploys, merges, infrastructure changes
Customer Support  → refunds, credits, subscription changes
Procurement       → purchases, vendor approvals, exceptions
Finance           → invoice/payment approval workflows
Operations        → privileged configuration and workflow actions
```

The commercial model is infrastructure: governed evaluations, managed policies, integrations, human review, audit/analytics, notifications/webhooks, usage entitlements, and enterprise controls as autonomous action volume grows.

## Safety and evaluation proof

Automated coverage includes:

- missing/stale critical evidence → `REVIEW`;
- contradictory evidence → `REVIEW`;
- malformed/unavailable SERV → fallback + `REVIEW`;
- deterministic hard `BLOCK` vs contextual allow → hard `BLOCK` wins;
- prompt-injection-like text inside evidence → treated as untrusted data;
- API-key create/use/revoke boundaries;
- GitHub App callback/webhook verification and duplicate-delivery protection;
- review evidence → full re-evaluation with a new receipt and parent lineage;
- provider degradation deliberately forced in Chrome E2E → real API returns `REVIEW`, never fail-open `ALLOW`;
- route-by-route product QA with browser-console errors treated as failures;
- branded recovery for 404/render failures.

These are application-level safety and reliability tests, not a formal security proof or compliance certification.

See [`docs/evaluation-report.md`](docs/evaluation-report.md) and [`docs/product-qa-2026-09.md`](docs/product-qa-2026-09.md).

## Release proof

Every PR to `main` runs the production gate:

```text
frozen install
→ lint
→ typecheck
→ package + web tests
→ production Next.js build
→ real headless-Chrome E2E
→ browser artifact upload
→ release smoke
```

A separate **Production Smoke** workflow runs on schedule and on manual dispatch against the deployed public URL. It executes `pnpm release:smoke` with `SMOKE_BASE_URL` and checks the public routes/readiness contract from GitHub-hosted infrastructure.

The final #69 product-QA head passed every repository gate above before merge.

See [`docs/release-checklist.md`](docs/release-checklist.md).

## Repository architecture

```text
VetoLayer/
├── apps/web/               # Next.js product UI + HTTP/API surface
├── packages/
│   ├── core/               # contracts, orchestration, receipts, review records
│   ├── policies/           # deterministic policy evaluation
│   ├── serv/               # SERV Reasoning adapter
│   └── sdk/                # evaluate-before-execute TypeScript client
├── examples/github-gate/   # GitHub evidence adapter + flagship policy pack
├── supabase/migrations/    # durable product schema
├── scripts/                # browser E2E + release smoke
├── docs/                   # product/developer/judge documentation
├── pnpm-lock.yaml
└── vercel.json
```

## Local setup

Requirements: Node.js 20.9+ and pnpm.

```bash
corepack enable
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

Open `http://localhost:3000`.

For SERV-backed contextual evaluations configure server-only values such as:

```text
SERV_API_KEY=...
SERV_MODEL=...
SERV_BASE_URL=https://inference-api.openserv.ai/v1
SERV_TIMEOUT_MS=20000
```

Never expose SERV, GitHub App, Supabase service-role, webhook-signing, API-key, or worker secrets through `NEXT_PUBLIC_*` variables.

Deployment/auth/integration variables are documented in [`docs/deployment.md`](docs/deployment.md).

## Developer API + SDK

`POST /api/v1/evaluate` evaluates the caller's action inside the server-owned credential scope. Decision lookup routes return stored receipt state. Hosted workspace/project/environment ownership is derived server-side; callers cannot switch tenants by sending a workspace header.

```ts
import { createVetoLayerClient, guardedToolCall } from "@vetolayer/sdk";

const veto = createVetoLayerClient({
  baseUrl: "https://your-vetolayer.example",
  apiKey: process.env.VETOLAYER_API_KEY,
});

const result = await guardedToolCall({
  client: veto,
  evaluation,
  execute: () => highImpactToolCall(),
});
```

See the in-product `/dashboard/docs` center and [`docs/product-guide.md`](docs/product-guide.md).

## SERV Hackathon Edition 01

VetoLayer targets the **Open Track**. The official Edition 01 page was re-verified on **25 September 2026**: submissions close **28 September 2026 at 00:00 UTC**; the official submission requires a public X post containing the project name, concept, images and relevant links, tagging `@openservai`, followed by the official form; judging criteria are **creativity, user-readiness, and revenue potential**.

Submission materials:

- [`docs/submission.md`](docs/submission.md) — final checklist, judging map, capture plan and release state;
- [`docs/demo-script.md`](docs/demo-script.md) — 2–3 minute judge presentation;
- [`docs/x-submission-post.md`](docs/x-submission-post.md) — copy-ready X post structure/copy;
- [`docs/release-checklist.md`](docs/release-checklist.md) — repository + deployed production verification.

---

VetoLayer does not replace IAM, deterministic authorization, security review, or compliance tooling. It adds a contextual pre-execution decision layer for autonomous systems that need more than permission alone.
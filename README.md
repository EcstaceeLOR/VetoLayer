# VetoLayer

**Agents can think freely. They shouldn't act freely.**

> **VetoLayer is a pre-execution reasoning and approval layer for autonomous AI agents.** It decides whether an agent **should** perform a proposed high-impact action given policy, evidence, exceptions, and current context — before the action reaches the real world.

**SERV Hackathon:** Edition 01 · Open Track  
**Core output:** `ALLOW | REVIEW | BLOCK` + tamper-evident Decision Receipt  
**Initial market wedge:** AI coding and deployment agents  
**Public demo:** `PENDING_PUBLIC_DEPLOYMENT` — do not treat this repository as submission-complete until a verified URL replaces this value.

## 60-second judge view

Autonomous agents increasingly have credentials that let them merge code, deploy production, issue refunds, change protected configuration, and call other consequential tools. Traditional authorization answers **can this agent act?** VetoLayer answers **should this agent act right now?**

VetoLayer evaluates every proposed action in two layers:

1. **Deterministic policy first** — permissions, thresholds, protected environments, mandatory approvals/evidence, freshness, and explicit denies stay hard and reproducible.
2. **SERV Reasoning only when judgment is required** — ambiguous policy language, exceptions, conflicting evidence, incident context, and unresolved conditions are evaluated contextually.

The final decision is `ALLOW`, `REVIEW`, or `BLOCK`, accompanied by an inspectable Decision Receipt containing the policies, evidence, reasoning trace, missing/contradictory evidence, exception path, timestamps, and a SHA-256 integrity marker.

The flagship demo proves the distinction with the **same auth-sensitive production deployment evaluated twice**: first `REVIEW` because security approval is missing; then `ALLOW` after that approval arrives as new verified evidence and the complete deterministic + SERV pipeline runs again.

## The control path

```text
AI Agent
   ↓
Action Request
   ↓
Deterministic Policy Engine
   ├── hard BLOCK / deterministic result ──────────────┐
   └── contextual policy requires judgment            │
                         ↓                              │
                    SERV Reasoning                      │
                         ↓                              │
               ALLOW / REVIEW / BLOCK ◄────────────────┘
                         ↓
                  Decision Receipt
                         ↓
                  External Tool
```

The invariant is simple:

> **Deterministic facts stay deterministic. Contextual judgment goes to SERV. Final precedence stays inside VetoLayer core.**

SERV cannot override an explicit deterministic hard `BLOCK`. Missing critical evidence cannot silently become `ALLOW`. Malformed, unavailable, or ungrounded SERV output safely degrades to `REVIEW`.

## Why SERV is essential

SERV is not a decorative model call or generic chatbot. `@vetolayer/serv` receives a normalized contextual bundle containing:

- proposed action
- applicable contextual policies
- deterministic findings already established
- supplied evidence and verification state
- environment / incident context
- documented exception criteria

It must return a structured judgment containing:

- recommended `ALLOW | REVIEW | BLOCK`
- policy-by-policy findings
- evidence used
- missing evidence
- contradictory evidence
- exception analysis
- rationale
- uncertainty/confidence where available

VetoLayer validates the response schema and grounds cited policy/evidence IDs before core orchestration can use the result. Removing SERV would remove VetoLayer's ability to reason about the contextual exception in the flagship scenario.

See [`docs/serv-reasoning.md`](docs/serv-reasoning.md).

## Flagship demo

An autonomous coding agent proposes an **authentication/security patch to production during a restricted deployment window**.

The context is intentionally tense:

```text
Restricted deployment window      ✓
Critical security incident         ✓
Sensitive auth/security changes    ✓
CI / security checks               ✓
Security-lead approval             ✕

VetoLayer → REVIEW
```

The missing security approval is then added as verified evidence. The action, PR, changed files, incident, and CI state remain the same. VetoLayer re-runs the same deterministic + SERV + orchestrator path:

```text
Restricted deployment window      ✓
Critical security incident         ✓
Sensitive auth/security changes    ✓
CI / security checks               ✓
Security-lead approval             ✓

VetoLayer → ALLOW
```

The UI does not hard-code the transition. Both evaluations produce a new Decision Receipt and expose the reasoning trace, SERV provider trace, evidence chain, and integrity hash.

**Demo route:** `/demo`  
**Verified public URL:** `PENDING_PUBLIC_DEPLOYMENT`

See [`docs/demo-script.md`](docs/demo-script.md).

## What is already productized

VetoLayer is no longer only the original decision-engine MVP. The current repository includes:

| Product surface | What it proves |
| --- | --- |
| Public landing + guided onboarding | A new user can understand the product and reach the first useful action quickly. |
| Authenticated workspaces | Supabase-backed login and server-derived workspace ownership isolate product data. |
| Control Center | Real decision stream, receipt drill-down, outcome filters, and decision-health analytics. |
| Policy Studio | Author deterministic rules and SERV-contextual policies, save them, and test them against sample actions. |
| Human Review Inbox | Review becomes new evidence and triggers re-evaluation instead of directly overriding policy. |
| Integrations setup | GitHub Gate and Developer API readiness are visible without exposing credentials to the browser. |
| GitHub Gate | Collects real PR metadata, changed files, reviews, and check-run evidence before a high-impact action. |
| Developer API | Framework-agnostic `POST /api/v1/evaluate` boundary for external agents and tools. |
| TypeScript SDK | Thin evaluate-before-execute client; workspace ownership stays server-controlled. |
| Decision Receipts | Canonical SHA-256 tamper-evident audit artifacts with human- and machine-readable decision facts. |
| First-run / Demo UX | Live, Demo, and Empty states are deliberately separated; seeded demo data never masquerades as production activity. |
| Accessibility / responsive UX | Keyboard focus, skip navigation, non-color outcome cues, reduced motion, forced-colors resilience, and mobile/tablet fallbacks. |
| Release gate | CI now requires lint, typecheck, tests, production build, and `pnpm release:smoke`. |

## Decision health, not vanity analytics

The Control Center derives metrics from real Decision Receipts rather than handwritten counters. It surfaces:

- `ALLOW / REVIEW / BLOCK` distribution
- unresolved reviews
- SERV-assisted vs deterministic-only decisions
- actions by tool/integration
- policies causing the most friction
- evidence completeness trends

Those metrics drill back into the underlying decisions and policies so teams can see **where autonomy is getting stuck and why**.

## Market path

The beachhead is **AI coding and deployment agents** because the buyer pain is immediate: engineering teams want more autonomous software work without granting unchecked authority over production.

VetoLayer then expands through the same action/evidence/policy contract:

```text
Engineering       → deploys, merges, infrastructure changes
Customer Support  → refunds, credits, subscription changes
Procurement       → purchases, vendor approvals, exceptions
Finance           → invoice / payment approval workflows
Operations        → privileged configuration and workflow actions
```

The revenue model is infrastructure: teams pay for governed evaluations, policy management, integrations, review workflows, audit history, usage, and enterprise controls as agent autonomy increases.

## Safety and evaluation proof

The automated suite covers:

- missing critical evidence → `REVIEW`
- stale evidence → `REVIEW`
- contradictory evidence → `REVIEW`
- malformed SERV output → provider fallback + `REVIEW`
- unavailable SERV provider → provider fallback + `REVIEW`
- fully supported contextual exception → may `ALLOW`
- almost-satisfied exception → `REVIEW`
- deterministic hard `BLOCK` versus contextual allow → hard `BLOCK`; SERV is not invoked
- prompt-injection-like text embedded in evidence → treated as untrusted data, not instructions
- irrelevant instruction-like evidence → cannot bypass hard restrictions
- same flagship action `REVIEW → ALLOW` only after the missing verified approval changes

These are application-level regression and safety evaluations, not a formal security proof or compliance certification.

See [`docs/evaluation-report.md`](docs/evaluation-report.md).

## Release proof

Every PR to `main` runs:

```text
install → lint → typecheck → tests → production build → release smoke
```

`pnpm release:smoke` verifies release-critical routes/source proof, confirms the flagship/evaluation tests remain part of the release surface, scans generated client assets for actual server-secret values when release secrets are present, and can optionally probe a deployed URL through `SMOKE_BASE_URL`.

The remaining manual release checks are intentionally limited to real-browser and live-provider concerns such as authenticated workspace isolation, live SERV credentials, the real GitHub integration path, and final screenshot/demo capture.

See [`docs/release-checklist.md`](docs/release-checklist.md).

## Product routes

| Surface | Purpose |
| --- | --- |
| `/` | public product landing page |
| `/login` | authenticated workspace access |
| `/onboarding` | guided first-project setup |
| `/dashboard` | decision control center + health overview |
| `/dashboard/decisions` | filterable decision stream |
| `/dashboard/policies` | Policy Studio |
| `/dashboard/reviews` | Human Review Inbox |
| `/dashboard/integrations` | GitHub/API setup and readiness |
| `/demo` | public flagship SERV-powered scenario |
| `/api/v1/evaluate` | framework-agnostic evaluation API |
| `/api/v1/decisions/:receiptId` | Decision Receipt lookup |

## Repository architecture

```text
VetoLayer/
├── apps/
│   └── web/               # product UI + HTTP/API surface
├── packages/
│   ├── core/              # contracts, orchestration, receipts, review records
│   ├── policies/          # deterministic policy evaluation
│   ├── serv/              # SERV Reasoning adapter only
│   └── sdk/               # lightweight evaluate-before-execute client
├── examples/
│   └── github-gate/       # flagship coding-agent integration
├── scripts/
│   └── release-smoke.mjs  # lightweight release verifier
└── docs/
```

See [`docs/architecture.md`](docs/architecture.md), [`docs/orchestrator.md`](docs/orchestrator.md), and [`docs/decision-receipts.md`](docs/decision-receipts.md).

## Getting started

Requirements: Node.js 20.9+ and pnpm.

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

SERV configuration:

```text
SERV_API_KEY=...
SERV_MODEL=...
SERV_BASE_URL=https://inference-api.openserv.ai/v1
SERV_TIMEOUT_MS=20000
```

All credentials are server-only. Never expose `SERV_API_KEY`, `GITHUB_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, or `VETOLAYER_API_KEY` through `NEXT_PUBLIC_*` variables.

Quality/release checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm release:smoke
```

Authentication, persistence, deployment, and release setup are documented in [`docs/auth-workspaces.md`](docs/auth-workspaces.md), [`docs/deployment.md`](docs/deployment.md), and [`docs/release-checklist.md`](docs/release-checklist.md).

## Developer API and SDK

`POST /api/v1/evaluate` accepts the same `ActionRequest`, `Policy`, and `Evidence` contracts used inside VetoLayer. `GET /api/v1/decisions/:receiptId` retrieves a stored decision status and receipt.

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

The SDK intentionally does **not** select a workspace. Hosted users get a server-derived authenticated workspace; Developer API credentials map to a server-configured service workspace. A caller cannot switch tenants by editing a request header.

## Hackathon submission status

The official Edition 01 page was re-verified on **24 September 2026**. VetoLayer targets the **Open Track**, whose brief is anything that runs on SERV Reasoning and surprises the judges. Current judging criteria are **creativity, user-readiness, and revenue potential**.

The public submission requires an X post containing the project name, concept, images, relevant links such as GitHub/live demo, and a tag of `@openservai`, followed by the official submission form. Edition 01 closes **28 September 2026 at 00:00 UTC**.

The full judge kit, capture checklist, copy-ready description, and pre-submit verification are in [`docs/submission.md`](docs/submission.md).

> **Submission blocker:** replace every `PENDING_PUBLIC_DEPLOYMENT` marker only after a real deployment is reachable, `/demo` is smoke-tested, and SERV is confirmed to run server-side. Issue #12 should remain open until then.

---

VetoLayer does not claim to replace IAM, deterministic authorization, security review, or compliance tooling. It adds a contextual pre-execution decision layer where autonomous agents need more than permission alone.

# VetoLayer

**Agents can think freely. They shouldn't act freely.**

> **VetoLayer is a pre-execution reasoning and approval layer for autonomous AI agents.** It decides whether an agent **should** perform a proposed high-impact action given policy, evidence, exceptions, and current context — before the action reaches the real world.

**SERV Hackathon:** Edition 01 · Open Track  
**Core output:** `ALLOW | REVIEW | BLOCK` + tamper-evident Decision Receipt  
**Initial market wedge:** AI coding and deployment agents  
**Public demo:** `PENDING_PUBLIC_DEPLOYMENT` — replace only after a verified deployment passes the live smoke test.

## 60-second judge view

Autonomous agents increasingly have credentials that let them merge code, deploy production, issue refunds, change protected configuration, and call other consequential tools. Traditional authorization answers **can this agent act?** VetoLayer answers **should this agent act right now?**

VetoLayer evaluates proposed actions in two layers:

1. **Deterministic policy first** — thresholds, protected environments, required approvals/evidence, freshness, and explicit denies remain hard and reproducible.
2. **SERV Reasoning only when judgment is required** — ambiguous policy language, exceptions, conflicting evidence, incident context, and unresolved conditions are evaluated contextually.

The final decision is `ALLOW`, `REVIEW`, or `BLOCK`, accompanied by an inspectable Decision Receipt containing the policies, evidence, reasoning trace, missing/contradictory evidence, exception path, timestamps, and a SHA-256 integrity marker.

The flagship demo proves the distinction with the **same auth-sensitive production deployment evaluated twice**: first `REVIEW` because security approval is missing; then the security-lead approval is added as clearly labelled seeded human-review evidence and the complete deterministic + SERV pipeline runs again. No sign-in is required to complete the public demo.

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

SERV is not a decorative model call or generic chatbot. `@vetolayer/serv` receives a normalized contextual bundle containing the proposed action, applicable contextual policies, deterministic findings, verified evidence, environment/incident context, and documented exception criteria.

It must return structured findings containing:

- recommended `ALLOW | REVIEW | BLOCK`
- policy-by-policy findings
- evidence used
- missing and contradictory evidence
- exception analysis
- rationale and confidence

VetoLayer schema-validates the response and grounds every cited policy/evidence ID before core orchestration can use it. If validation or the provider fails, the action escalates to `REVIEW`.

See [`docs/serv-reasoning.md`](docs/serv-reasoning.md).

## Flagship demo

An autonomous coding agent proposes an **authentication/security patch to production during a restricted deployment window**.

```text
Restricted deployment window      ✓
Critical security incident         ✓
Sensitive auth/security changes    ✓
CI / security checks               ✓
Security-lead approval             ✕

VetoLayer → REVIEW
```

The public demo then adds a clearly labelled seeded `HumanReviewRecord` from the security lead. The action, PR, changed files, incident, and CI state remain unchanged. VetoLayer re-runs the deterministic + SERV + orchestrator path:

```text
Restricted deployment window      ✓
Critical security incident         ✓
Sensitive auth/security changes    ✓
CI / security checks               ✓
Security-lead approval             ✓

VetoLayer → ALLOW   (only if SERV and policy evidence support it)
```

The UI cannot request the resolved state directly. The second decision must pass through the demo human-review endpoint, and both evaluations produce a new Decision Receipt. If SERV is unavailable, the second pass remains `REVIEW` rather than pretending the live reasoning succeeded.

**Demo route:** `/demo`  
**Verified public URL:** `PENDING_PUBLIC_DEPLOYMENT`

See [`docs/demo-script.md`](docs/demo-script.md).

## Product surface

| Surface | What it proves |
| --- | --- |
| Landing + onboarding | A new user can understand the product and reach a useful action quickly. |
| Authenticated workspaces | Supabase login and server-derived ownership isolate product data. |
| Control Center | Decision stream, receipt drill-down, filters, and decision-health analytics. |
| Policy Studio | Author deterministic and SERV-contextual policy, then simulate it. |
| Human Review Inbox | Human decisions become evidence and trigger re-evaluation. |
| Integrations | GitHub and Developer API readiness without exposing secrets. |
| GitHub Gate | Real PR metadata, changed files, reviews, and check-run evidence. |
| Developer API + SDK | Framework-agnostic evaluate-before-execute boundary. |
| Decision Receipts | Canonical SHA-256 tamper-evident audit artifacts. |
| First-run / Demo UX | Live, Demo, and Empty states stay visibly distinct. |
| Accessibility | Keyboard focus, skip navigation, non-color outcome cues, reduced motion, and responsive fallbacks. |
| Release gate | CI requires lint, typecheck, tests, production build, and release smoke. |

## Decision health

The Control Center derives metrics from Decision Receipts rather than fake counters:

- `ALLOW / REVIEW / BLOCK` distribution
- unresolved reviews
- SERV-assisted vs deterministic-only decisions
- actions by tool/integration
- policies causing the most friction
- evidence completeness trends

Those metrics drill back into the underlying decisions and policies so teams can see where autonomy is getting stuck and why.

## Market path

The beachhead is **AI coding and deployment agents** because engineering teams want more autonomous software work without granting unchecked authority over production.

```text
Engineering       → deploys, merges, infrastructure changes
Customer Support  → refunds, credits, subscription changes
Procurement       → purchases, vendor approvals, exceptions
Finance           → invoice / payment approval workflows
Operations        → privileged configuration and workflow actions
```

The revenue model is infrastructure: governed evaluations, policy management, integrations, review workflows, audit history, and enterprise controls as agent autonomy increases.

## Safety and evaluation proof

Automated coverage includes:

- missing/stale critical evidence → `REVIEW`
- contradictory evidence → `REVIEW`
- malformed/unavailable SERV → fallback + `REVIEW`
- fully supported contextual exception → may `ALLOW`
- deterministic hard `BLOCK` vs contextual allow → hard `BLOCK`; SERV cannot override it
- prompt-injection-like text inside evidence → treated as untrusted data
- public flagship HTTP flow → same action `REVIEW → human-review evidence → ALLOW`
- direct attempt to skip to the demo's resolved state → rejected
- production Developer API without bearer-key configuration → disabled, not public
- canonical auth redirect and internal continuation-path validation

These are application-level regression/safety evaluations, not a formal security proof or compliance certification.

See [`docs/evaluation-report.md`](docs/evaluation-report.md).

## Repository architecture

```text
VetoLayer/
├── apps/
│   └── web/               # Next.js product UI + HTTP/API surface
├── packages/
│   ├── core/              # contracts, orchestration, receipts, review records
│   ├── policies/          # deterministic policy evaluation
│   ├── serv/              # SERV Reasoning adapter only
│   └── sdk/               # evaluate-before-execute client
├── examples/
│   └── github-gate/       # flagship coding-agent integration
├── scripts/
│   └── release-smoke.mjs  # release/deployment verifier
├── pnpm-lock.yaml         # deterministic workspace dependency graph
├── vercel.json            # monorepo deployment configuration
└── docs/
```

See [`docs/architecture.md`](docs/architecture.md), [`docs/orchestrator.md`](docs/orchestrator.md), and [`docs/decision-receipts.md`](docs/decision-receipts.md).

## Local setup

Requirements: Node.js 20.9+ and pnpm.

```bash
corepack enable
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

Open `http://localhost:3000`.

For the SERV-backed flagship demo, configure at minimum:

```text
SERV_API_KEY=...
SERV_MODEL=...
SERV_BASE_URL=https://inference-api.openserv.ai/v1
SERV_TIMEOUT_MS=20000
```

All credentials are server-only. Never expose `SERV_API_KEY`, `GITHUB_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, or `VETOLAYER_API_KEY` through `NEXT_PUBLIC_*` variables.

## Vercel deployment

Import the **repository root**. The committed [`vercel.json`](vercel.json) defines the monorepo build:

```text
Install:  pnpm install --frozen-lockfile
Build:    pnpm --filter @vetolayer/web build
Output:   apps/web/.next
```

Do **not** set the Vercel Root Directory to `apps/web`; the app imports workspace packages outside that directory.

The public hackathon demo requires `SERV_API_KEY` and `SERV_MODEL`. Authentication/persistence/GitHub/API variables are documented in [`docs/deployment.md`](docs/deployment.md). Production `/api/v1/*` routes fail closed if `VETOLAYER_API_KEY` is not configured.

After deployment:

```bash
SMOKE_BASE_URL=https://<your-production-domain> pnpm release:smoke
```

The live smoke probe checks public surfaces and `/api/health`, and requires `demoReady: true` before the release can be considered submission-ready.

## Quality gate

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm release:smoke
```

CI runs this sequence on every PR to `main`.

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

Hosted users get a server-derived authenticated workspace. Developer API credentials map to a server-configured service workspace; callers cannot switch tenants through headers.

## Hackathon submission status

VetoLayer targets the **SERV Edition 01 Open Track**. The judge kit, capture checklist, copy-ready description, and pre-submit verification live in [`docs/submission.md`](docs/submission.md).

> **Submission blocker:** replace every `PENDING_PUBLIC_DEPLOYMENT` marker only after a real deployment is reachable, `/demo` completes the live SERV-backed flow, and the deployed smoke test passes. Issue #12 remains open until then.

---

VetoLayer does not claim to replace IAM, deterministic authorization, security review, or compliance tooling. It adds a contextual pre-execution decision layer where autonomous agents need more than permission alone.

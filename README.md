# VetoLayer

**Agents can think freely. They shouldn't act freely.**

> **VetoLayer is a pre-execution reasoning and approval layer for autonomous AI agents.** It decides whether an agent **should** perform a proposed action given policy, evidence, exceptions, and current context — before the action reaches the real world.

**SERV Hackathon track:** Open Track  
**Core output:** `ALLOW | REVIEW | BLOCK` + tamper-evident Decision Receipt  
**Initial market wedge:** AI coding and deployment agents

## The problem

Agent permissions answer **can this agent act?** They do not reliably answer **should this agent act right now?**

That distinction matters when an autonomous agent can merge code, deploy production, modify protected configuration, issue refunds, approve purchases, or invoke other high-impact tools. Many policies are also contextual rather than purely boolean:

- production changes may normally be restricted during a change freeze
- an emergency security fix may qualify for an exception
- that exception may require passing CI, a human security approval, and evidence of an active incident

A normal rules engine is good at hard restrictions. It is much weaker at interpreting contextual policy, exceptions, evidence, ambiguity, and contradictions.

## The solution

VetoLayer places a decision gate between an autonomous agent and the tool it wants to use.

```text
AI Agent
   ↓
Action Request
   ↓
Deterministic Policy Engine
   ├── hard rule resolves it ─────────────┐
   └── contextual judgment required      │
                    ↓                     │
               SERV Reasoning             │
                    ↓                     │
          ALLOW / REVIEW / BLOCK ◄────────┘
                    ↓
             Decision Receipt
                    ↓
             External Tool
```

Hard restrictions remain deterministic. SERV handles the cases where VetoLayer must reason over **context, policy language, evidence, exceptions, missing information, and contradictions**.

## Why SERV is central

SERV is not used as a decorative model call or generic chatbot. `@vetolayer/serv` receives only the contextual policies that survived deterministic evaluation together with the proposed action, verified evidence, existing findings, and relevant environment context.

SERV returns a structured judgment containing:

- recommended `ALLOW | REVIEW | BLOCK`
- policy-by-policy findings
- evidence actually used
- missing evidence
- contradictory evidence
- exception analysis
- rationale and confidence

VetoLayer validates and grounds that response before it can affect the final decision. SERV cannot override an explicit deterministic hard `BLOCK`. If the SERV provider is unavailable, malformed, or ungrounded, VetoLayer fails safely to `REVIEW` rather than accidentally approving an action.

See [`docs/serv-reasoning.md`](docs/serv-reasoning.md).

## Flagship demo

The judge-facing demo follows an autonomous coding agent attempting a **production deployment of an authentication/security patch during a restricted deployment window**.

The proposed action is associated with a critical incident, the code change touches sensitive authentication paths, and CI passes — but the first evaluation is missing the required human security approval.

**Evaluation 1**

```text
Restricted deployment window      ✓
Critical incident                 ✓
Security-sensitive patch          ✓
CI / security checks              ✓
Security-lead approval            ✕

VetoLayer → REVIEW
```

The approval is then added as new verified evidence and **the same action is re-evaluated through the real deterministic + SERV pipeline**.

**Evaluation 2**

```text
Restricted deployment window      ✓
Critical incident                 ✓
Security-sensitive patch          ✓
CI / security checks              ✓
Security-lead approval            ✓

VetoLayer → ALLOW
```

The UI does not hard-code either result. Both evaluations generate a Decision Receipt and expose the reasoning trace, SERV provider trace, evidence chain, and integrity hash.

**Demo route:** `/demo`  
**Public demo URL:** pending deployment

See [`docs/demo-script.md`](docs/demo-script.md).

## Product, not just a hackathon demo

VetoLayer already includes the pieces needed to behave like a real product:

- **Control Center** — decision stream and receipt inspection
- **Policy Studio** — author deterministic and SERV-contextual policies
- **Human Review Inbox** — add human decisions as evidence and re-run the same policy path
- **GitHub Gate** — real PR metadata, changed files, reviews, and check-run evidence
- **Developer API** — framework-agnostic `POST /api/v1/evaluate`
- **TypeScript SDK** — thin `evaluate-before-execute` client boundary
- **Decision Receipts** — canonical, SHA-256 tamper-evident audit records
- **MVP persistence** — optional durable receipt storage through server-side Supabase REST
- **Safety evaluations** — adversarial regression cases for provider failure, stale/missing evidence, contradictions, hard-block precedence, and instruction-like untrusted text

## Market path

VetoLayer starts with **AI coding/deployment agents** because the value is immediately measurable: teams want more autonomous software agents without giving them unchecked authority over production systems.

The underlying decision contract is horizontal, so the same product can expand through policy packs and integrations:

```text
Engineering     → deploys, merges, infrastructure changes
Customer Support→ refunds, credits, subscription changes
Procurement     → purchases, vendor approvals, exceptions
Finance         → invoice/payment approval workflows
Operations      → privileged configuration and workflow actions
```

The business model is infrastructure: teams integrate VetoLayer at high-impact tool boundaries and pay for governed evaluations, policy management, review workflows, audit history, and enterprise controls.

## Safety and evaluation proof

The automated evaluation suite covers:

- missing critical evidence → `REVIEW`
- stale evidence → `REVIEW`
- contradictory evidence → `REVIEW`
- malformed SERV output → provider fallback + `REVIEW`
- unavailable SERV provider → provider fallback + `REVIEW`
- fully supported contextual exception → may `ALLOW`
- almost-satisfied exception → `REVIEW`
- deterministic hard `BLOCK` versus contextual allow → hard `BLOCK`, SERV is not invoked
- prompt-injection-like text in evidence → treated as untrusted data
- irrelevant instruction-like data → cannot bypass hard restrictions

These are application-level regression/safety evaluations, not a formal security proof or compliance certification.

See [`docs/evaluation-report.md`](docs/evaluation-report.md).

## Product surfaces

| Surface | Purpose |
| --- | --- |
| `/` | public product landing page |
| `/onboarding` | guided first-project setup |
| `/dashboard` | decision control center |
| `/dashboard/policies` | Policy Studio |
| `/dashboard/reviews` | Human Review Inbox |
| `/demo` | flagship SERV-powered deployment scenario |
| `/api/v1/evaluate` | framework-agnostic evaluation API |
| `/api/v1/decisions/:receiptId` | Decision Receipt status lookup |

## Repository architecture

```text
VetoLayer/
├── apps/
│   └── web/               # product UI + HTTP/API surface
├── packages/
│   ├── core/              # contracts, orchestration, receipts, review records
│   ├── policies/          # deterministic policy evaluation
│   ├── serv/              # SERV Reasoning adapter
│   └── sdk/               # lightweight developer client
├── examples/
│   └── github-gate/       # flagship coding-agent integration
└── docs/
```

The architectural invariant is intentionally simple:

> **deterministic facts stay deterministic; contextual judgment goes to SERV; final precedence stays inside VetoLayer core.**

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

All credentials are server-only. Never expose `SERV_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `VETOLAYER_API_KEY` through `NEXT_PUBLIC_*` variables.

Quality checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Deployment and persistence setup are documented in [`docs/deployment.md`](docs/deployment.md).

## Developer API and SDK

`POST /api/v1/evaluate` accepts the same `ActionRequest`, `Policy`, and `Evidence` contracts used by the rest of VetoLayer. `GET /api/v1/decisions/:receiptId` retrieves a stored decision status and receipt.

```ts
import { createVetoLayerClient, guardedToolCall } from "@vetolayer/sdk";

const veto = createVetoLayerClient({
  baseUrl: "https://your-vetolayer.example",
  apiKey: process.env.VETOLAYER_API_KEY,
  workspaceId: "production",
});

const result = await guardedToolCall({
  client: veto,
  evaluation,
  execute: () => highImpactToolCall(),
});
```

The SDK does not introduce another agent framework. It implements one boundary: **evaluate before execute**.

## Submission material

The judge/demo script, capture checklist, official submission checklist, judging map, and copy-ready project description are in [`docs/submission.md`](docs/submission.md).

---

VetoLayer does not claim to replace IAM, deterministic authorization, security review, or compliance tooling. It adds a contextual pre-execution decision layer where autonomous agents need more than permission alone.

# VetoLayer

**Agents can think freely. They shouldn't act freely.**

VetoLayer is the reasoning and approval layer for autonomous AI actions. It evaluates what an agent is about to do against deterministic rules, contextual policies, and evidence before the action reaches the real world.

## Product thesis

Traditional access control answers: **Can this agent perform this action?**

VetoLayer answers: **Should this agent perform this action right now, given policy, evidence, exceptions, and context?**

Hard restrictions stay deterministic. Ambiguous policy judgment is routed to SERV Reasoning. Every evaluation ends in a typed `ALLOW`, `REVIEW`, or `BLOCK` decision plus a tamper-evident Decision Receipt.

## Decision path

```text
Action Request
   ↓
Deterministic Policy Checks
   ↓
Contextual judgment needed?
   ├── No ───────────────┐
   └── Yes → SERV Reasoning
                         ↓
               ALLOW / REVIEW / BLOCK
                         ↓
                  Decision Receipt
```

See [`docs/architecture.md`](docs/architecture.md) for the architectural boundaries.

## Repository

```text
VetoLayer/
├── apps/
│   └── web/               # product UI + HTTP/API surface
├── packages/
│   ├── core/              # contracts, orchestration, receipts, review records
│   ├── policies/          # deterministic policy evaluation
│   ├── serv/              # SERV Reasoning adapter
│   └── sdk/               # tiny developer client
├── examples/
│   └── github-gate/       # flagship coding-agent integration
└── docs/
```

## Getting started

Requirements: Node.js 20.9+ and pnpm.

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

Quality checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Developer API

`POST /api/v1/evaluate` accepts the same `ActionRequest`, `Policy`, and `Evidence` contracts used everywhere else in VetoLayer. `GET /api/v1/decisions/:receiptId` returns the stored status and Decision Receipt.

For hosted environments, set `VETOLAYER_API_KEY` and send it as a bearer token. `X-VetoLayer-Workspace` scopes status/persistence to a workspace.

### Tiny TypeScript client

```ts
import { createVetoLayerClient, guardedToolCall } from "@vetolayer/sdk";

const veto = createVetoLayerClient({
  baseUrl: "https://your-vetolayer.example",
  apiKey: process.env.VETOLAYER_API_KEY,
  workspaceId: "support-prod",
});

const guarded = await guardedToolCall({
  client: veto,
  evaluation: {
    action: {
      id: "refund-42",
      actor: { id: "support-agent", kind: "agent" },
      action: {
        type: "customer-support",
        tool: "billing-service",
        operation: "issue-refund",
        arguments: { accountId: "acct-42", amount: 750, currency: "USD" },
      },
      target: { type: "customer-account", id: "acct-42", environment: "production" },
      context: { source: "support-agent", environment: "production" },
      requestedAt: new Date().toISOString(),
    },
    policies: [largeRefundPolicy],
    facts: { refundAmount: 750 },
  },
  execute: () => billing.issueRefund("acct-42", 750),
});

if (guarded.evaluation.decision.outcome !== "ALLOW") {
  // Tool execution never happened.
  console.log(guarded.evaluation.decision.outcome);
}
```

The SDK is intentionally small. It does not introduce another agent framework; it only implements the `evaluate-before-execute` boundary.

## Product surfaces

- `/` — product landing page
- `/onboarding` — guided first-project setup
- `/dashboard` — control center
- `/dashboard/policies` — Policy Studio
- `/dashboard/reviews` — Human Review Inbox
- `/demo` — flagship SERV-powered production deployment scenario
- `/api/v1/evaluate` — framework-agnostic evaluation API

## Environment

SERV and persistence credentials are server-only. Copy `.env.example` and never expose `SERV_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `VETOLAYER_API_KEY` through `NEXT_PUBLIC_` variables.

Without Supabase, the local/demo product uses safe fallback storage where supported. SERV provider failure never fails open; contextual evaluation falls back to `REVIEW`.

## MVP boundary

VetoLayer starts with autonomous coding/deployment actions, but its core contracts and Developer API are deliberately horizontal. The project avoids unrelated infrastructure, generic multi-agent orchestration, blockchain dependencies, and premature enterprise complexity.

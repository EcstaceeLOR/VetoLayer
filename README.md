# VetoLayer

**Agents can think freely. They shouldn't act freely.**

VetoLayer is the reasoning and approval layer for autonomous AI actions. It evaluates what an agent is about to do against deterministic rules, contextual policies, and evidence before the action reaches the real world.

## Product thesis

Traditional access control answers: **Can this agent perform this action?**

VetoLayer answers the harder question: **Should this agent perform this action right now, given policy, evidence, exceptions, and context?**

Hard restrictions stay deterministic. Ambiguous policy judgment is routed to SERV Reasoning. Every evaluation ends in a typed `ALLOW`, `REVIEW`, or `BLOCK` decision and, as the product evolves, an auditable Decision Receipt.

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

See [`docs/architecture.md`](docs/architecture.md) for the architectural boundaries that future issues must preserve.

## Repository

```text
VetoLayer/
├── apps/
│   └── web/               # product UI + HTTP/API surface
├── packages/
│   ├── core/              # domain contracts + orchestration
│   ├── serv/              # SERV Reasoning adapter only
│   └── policies/          # deterministic policy evaluation
├── examples/
│   └── github-gate/       # flagship coding-agent integration
└── docs/
```

## Getting started

Requirements: Node.js 20.9+ and pnpm.

```bash
corepack enable
pnpm install
cp apps/web/.env.example apps/web/.env.local
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

## Environment

SERV credentials are server-only. Put them in `apps/web/.env.local`; never commit that file and never prefix SERV secrets with `NEXT_PUBLIC_`.

The actual SERV client is intentionally deferred to the dedicated SERV integration issue. This scaffold only establishes the secure configuration boundary.

## MVP boundary

VetoLayer starts with autonomous coding/deployment actions, but the core model must remain general enough to support other high-impact actions later. The MVP intentionally avoids unrelated infrastructure, generic multi-agent orchestration, blockchain dependencies, and premature enterprise complexity.

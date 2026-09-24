# VetoLayer — SERV Hackathon Edition 01 submission kit

Last re-verified against the official Edition 01 hackathon page: **24 September 2026**.

## Project identity

**Name:** VetoLayer  
**Track:** Open Track  
**Tagline:** Agents can think freely. They shouldn't act freely.  
**One-line pitch:** VetoLayer is a pre-execution reasoning and approval layer that decides whether autonomous AI agents should perform high-impact actions given policy, evidence, exceptions, and current context.

## 60-second project description

Autonomous agents increasingly have permission to merge code, deploy production, modify protected systems, and trigger business actions. Traditional authorization answers whether an agent **can** act; it does not reliably answer whether the agent **should** act right now.

VetoLayer sits between an agent and a high-impact tool. Hard restrictions are evaluated deterministically. When policy depends on context, evidence, exceptions, ambiguity, or contradictions, VetoLayer routes that judgment to **SERV Reasoning**. The final result is a typed `ALLOW`, `REVIEW`, or `BLOCK` decision plus a tamper-evident Decision Receipt explaining which policies and evidence mattered.

The initial product wedge is AI coding/deployment agents. The shipped product already includes authenticated workspaces, Policy Studio, Human Review, GitHub/API integration setup, decision-health analytics, a Developer API/SDK, guided first-run UX, accessibility/responsive work, and a release-smoke gate.

## Why SERV is necessary

VetoLayer deliberately does **not** ask SERV to solve problems deterministic code can solve.

SERV is used when policy requires contextual interpretation, for example:

> Production deployments are normally restricted during a change freeze, except for critical security remediation when the incident is verified, required checks pass, and the appropriate human approval is present.

That is not merely a threshold check. It requires interpretation of policy intent, supplied evidence, exception criteria, missing information, and contradictions.

VetoLayer sends SERV a normalized contextual bundle and requires structured output containing policy findings, evidence usage, missing evidence, contradiction analysis, exception analysis, rationale, and an outcome recommendation. The result is schema-validated and grounded before the core orchestrator can use it.

Hard deterministic `BLOCK`s retain precedence. Missing critical evidence never silently becomes `ALLOW`. SERV/provider failure safely degrades to `REVIEW`.

## Flagship scenario

An autonomous coding agent proposes a production deployment that changes authentication/security code during a restricted deployment window.

Context:

- a critical production security incident is active
- the patch changes sensitive auth/security paths
- CI/security checks pass
- the policy has a documented emergency exception
- security-lead approval is initially missing

### First evaluation

**Result: `REVIEW`.**

VetoLayer does not say the agent lacks permission. It says the supplied evidence is not yet sufficient to justify the exception.

### Evidence changes

The security lead approves. That approval is added as new verified evidence. The same action, PR, files, incident, and CI state are re-evaluated through the same deterministic + SERV + orchestrator pipeline.

### Second evaluation

**Result: `ALLOW`.**

The UI does not flip a hard-coded state. The evidence changes and VetoLayer reasons again. Both evaluations produce Decision Receipts.

See [`demo-script.md`](demo-script.md).

## What judges can verify in the repository

### Core decision system

- `packages/core` — typed contracts, orchestration, review records, Decision Receipts
- `packages/policies` — deterministic policy evaluator
- `packages/serv` — SERV Reasoning adapter only
- `examples/github-gate` — real GitHub evidence adapter and flagship policy pack

### Product surfaces

- `/` — public product landing page
- `/login` — Supabase-hosted authentication
- `/onboarding` — guided first-project path
- `/dashboard` — Control Center and decision-health overview
- `/dashboard/decisions` — real decision stream and receipt drill-down
- `/dashboard/policies` — Policy Studio
- `/dashboard/reviews` — Human Review Inbox
- `/dashboard/integrations` — GitHub Gate / Developer API readiness and safe connection testing
- `/demo` — public flagship scenario

### Developer surface

- `POST /api/v1/evaluate` — framework-agnostic evaluation endpoint
- `GET /api/v1/decisions/:receiptId` — Decision Receipt lookup
- `packages/sdk` — thin evaluate-before-execute client

Hosted workspace ownership is server-derived. Developer API credentials map to a server-configured service workspace. The SDK does not select a caller-controlled workspace.

## Judging map

### Creativity

- Reasoning is used as an **enforcement boundary**, not a chatbot feature.
- VetoLayer separates hard deterministic policy from contextual SERV judgment.
- Human review becomes new evidence and triggers re-evaluation instead of directly overriding the policy engine.
- The same typed decision contract supports GitHub today and other high-impact domains later.
- Every decision produces an inspectable integrity-marked receipt.

### User-readiness

The repository now goes significantly beyond the original MVP:

- polished public landing page and guided onboarding
- authenticated, server-owned workspaces
- Control Center and receipt inspection
- real Decision Receipt-derived analytics
- Policy Studio
- Human Review Inbox
- GitHub integration setup and safe connection testing
- Developer API + TypeScript SDK
- explicit Live / Demo / Empty states
- keyboard/accessibility/responsive pass
- release-smoke gate after the production build
- rate limiting, validation, server-only credentials, safe provider fallback, and optional durable persistence

### Revenue potential

**Initial buyer:** engineering teams adopting autonomous coding/deployment agents.

**Initial paid value:**

- governed high-impact agent actions
- policy management and reusable policy packs
- human review workflows
- integrations and API usage
- decision history and operational analytics
- enterprise controls as autonomy expands

**Expansion path:** customer support, procurement, finance, operations, and other domains where agents can take consequential actions.

No market-size, formal-security-proof, or compliance-certification claims are required for this hackathon story.

## Safety and evaluation proof

Automated evaluations cover:

- missing critical evidence
- stale evidence
- contradictory evidence
- malformed SERV output
- unavailable SERV provider
- contextual exception fully satisfied
- contextual exception missing one condition
- deterministic hard `BLOCK` versus contextual allow
- instruction-like / prompt-injection-like text embedded in untrusted evidence
- irrelevant evidence attempting to influence a blocked action
- flagship `REVIEW → ALLOW` transition only after verified evidence changes

See [`evaluation-report.md`](evaluation-report.md).

## Release-quality proof

The normal release gate is now:

```text
install → lint → typecheck → tests → production build → release smoke
```

`pnpm release:smoke` checks release-critical product surfaces, ensures the behavioral proof tests remain present, scans generated client assets for actual server-secret values when release secrets are available, and can optionally probe a deployed URL using `SMOKE_BASE_URL`.

Manual checks are restricted to concerns that genuinely require a deployed browser/live credentials: auth isolation, live SERV behavior, GitHub connectivity, and final capture.

See [`release-checklist.md`](release-checklist.md).

## Capture checklist

After the public deployment is verified, capture:

1. **Landing hero** — name, tagline, and core value proposition.
2. **Demo first evaluation** — high-risk deployment showing `REVIEW` and missing approval.
3. **Decision Receipt / reasoning trace** — contextual findings, evidence, and integrity marker.
4. **Human Review** — approval recorded as evidence, not a direct bypass.
5. **Demo second evaluation** — same action showing `ALLOW` after the evidence changes.
6. **Policy Studio** — one deterministic rule and one SERV-contextual policy.
7. **Control Center / decision health** — real receipt-derived metrics and decision stream.
8. **Integrations** — GitHub Gate / Developer API readiness without exposed credentials.

Optional: a 20–40 second GIF showing `REVIEW → human approval evidence → re-evaluate → ALLOW`.

Never capture API keys, tokens, service-role credentials, private environment values, or private user data.

## Official Edition 01 requirements — re-verified 24 September 2026

Current official page states:

- [ ] Project is new, working, and demoable by **28 September 2026**.
- [ ] Data collection is enabled in OpenServ organization settings for eligibility.
- [ ] Submission targets the **Open Track**: anything that runs on SERV Reasoning and surprises the judges.
- [ ] A public post is published on the builder's X feed.
- [ ] The post includes the project **name**.
- [ ] The post explains the **concept**.
- [ ] The post includes **images**.
- [ ] The post includes relevant links such as GitHub/live demo where necessary.
- [ ] The post tags **@openservai**.
- [ ] The official submission form is completed after the public post.
- [ ] Submission is completed before **28 September 2026 at 00:00 UTC**.

Current judging criteria:

1. creativity
2. user-readiness
3. revenue potential

## Deployment-dependent fields

**Repository:** https://github.com/EcstaceeLOR/VetoLayer  
**Live demo:** `PENDING_PUBLIC_DEPLOYMENT`  
**Flagship route after deployment:** `/demo`

Do **not** replace `PENDING_PUBLIC_DEPLOYMENT` with an assumed domain. A final URL counts only after:

1. the deployment reaches a public URL,
2. `/` and `/demo` load logged out,
3. live SERV credentials are configured server-side,
4. the flagship evaluation is exercised,
5. `SMOKE_BASE_URL=<url> pnpm release:smoke` succeeds or equivalent route probing is verified,
6. no secret values appear in browser output.

## Recommended X post structure

1. Hook: agents increasingly have authority, but permission is not judgment.
2. Name + concept: **VetoLayer — the pre-execution decision layer for autonomous agents.**
3. Explain the split: deterministic policy first; SERV for contextual exceptions/evidence.
4. Show the flagship `REVIEW → evidence changes → ALLOW` flow.
5. Mention Decision Receipts and the product surfaces proving user-readiness.
6. State the initial market wedge: autonomous coding/deployment agents.
7. Include screenshots or short demo clip.
8. Add verified GitHub + live demo links.
9. Tag `@openservai`.

## Final pre-submit verification

### Public deployment

- [ ] Verified public URL replaces `PENDING_PUBLIC_DEPLOYMENT` in README and this file.
- [ ] Landing page opens successfully in a logged-out browser.
- [ ] `/demo` loads without developer intervention or authentication.
- [ ] Sign-in / authenticated workspace routes behave correctly.
- [ ] SERV credentials are configured server-side.

### Flagship proof

- [ ] First demo stage returns the expected safe `REVIEW` when approval is missing.
- [ ] Human review adds verified evidence rather than bypassing the decision path.
- [ ] Same action is re-evaluated after evidence changes.
- [ ] Second stage can reach `ALLOW` only when requirements are satisfied.
- [ ] Provider fallback is not disguised as successful SERV reasoning.
- [ ] Decision Receipt and integrity marker are generated.

### Product / security hygiene

- [ ] GitHub connection test works with server-only credentials.
- [ ] Developer API credential maps to the configured service workspace.
- [ ] Caller-selected workspace headers are not part of the SDK contract.
- [ ] Decision health shows Live/Demo/Empty state honestly.
- [ ] `pnpm release:smoke` passes.
- [ ] No secret values appear in client assets, browser output, or screenshots.
- [ ] GitHub repository is public.

### Submission

- [ ] README points to the verified live URL.
- [ ] Screenshots/GIFs are captured from the verified deployment.
- [ ] X post uses the verified links and tags `@openservai`.
- [ ] OpenServ data collection eligibility setting is enabled.
- [ ] Official form is submitted after the public X post.

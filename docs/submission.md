# VetoLayer — SERV Hackathon Edition 01 submission kit

Last re-verified against the official Edition 01 page: **25 September 2026**.  
Official source: https://www.openserv.ai/hackathon

## Project identity

**Name:** VetoLayer  
**Track:** Open Track  
**Tagline:** Agents can think freely. They shouldn't act freely.  
**One-line pitch:** VetoLayer is a pre-execution reasoning and approval layer that decides whether autonomous AI agents should perform high-impact actions given policy, evidence, exceptions, and current context.  
**Repository:** https://github.com/EcstaceeLOR/VetoLayer  
**Public product URL:** https://vetolayer.vercel.app

> The public URL already exists, but the latest `main` release is waiting for the current Vercel account build-rate limit to clear. Issue #12 stays open until the latest deployed `main` passes the repository's Production Smoke workflow.

## 60-second project description

Autonomous agents increasingly have permission to merge code, deploy production, issue refunds, modify protected systems, and trigger business actions. Traditional authorization answers whether an agent **can** act; it does not reliably answer whether the agent **should** act right now.

VetoLayer sits between an agent and a high-impact tool. Hard restrictions are evaluated deterministically. When policy depends on context, evidence, exceptions, ambiguity, or contradictions, VetoLayer routes that judgment to **SERV Reasoning**. The core orchestrator then returns `ALLOW`, `REVIEW`, or `BLOCK`, together with a Decision Receipt that records exact policy versions, findings, evidence, missing/contradictory evidence, reasoning trace, lineage, provider status, timestamps, and SHA-256 integrity metadata.

The initial market wedge is AI coding/deployment agents. The shipped product now includes complete account/workspace/project/environment lifecycle, GitHub App + Developer API integrations, Policy Studio, Human Review operations, Decision Explorer / Receipt Center, notifications and signed webhooks, append-only security audit, operational analytics, settings and retention, in-product documentation, pricing/usage entitlements, data export/offboarding, and browser-level production reliability.

## Why SERV is necessary

VetoLayer deliberately does **not** ask SERV to solve problems deterministic code can solve.

SERV is used when policy requires contextual interpretation, for example:

> Production deployments are normally restricted during a change freeze, except for critical security remediation when the incident is verified, required checks pass, and the appropriate human approval is present.

That policy contains intent, an exception, evidence requirements, and potentially conflicting context. VetoLayer sends SERV a normalized bundle containing the proposed action, contextual policy versions, deterministic findings, verified evidence, exception criteria, and environment/incident context.

SERV must return structured policy findings, evidence usage, missing evidence, contradiction analysis, exception analysis, rationale, confidence, and an outcome recommendation. VetoLayer schema-validates and grounds those IDs before the core orchestrator can use them.

Hard deterministic `BLOCK`s retain precedence. Missing critical evidence never silently becomes `ALLOW`. Malformed/unavailable SERV safely degrades to `REVIEW`.

## Flagship product scenario

An autonomous coding agent proposes a production deployment that changes authentication/security code during a restricted deployment window.

Context:

- a critical production security incident is active;
- the patch changes sensitive auth/security paths;
- CI/security checks pass;
- the policy has a documented emergency exception;
- security-lead approval is initially missing.

### First evaluation — `REVIEW`

VetoLayer does not say the agent lacks permission. It says the available evidence is not yet sufficient to justify the exception.

### Human Review adds evidence

A reviewer supplies the missing approval through the real Human Review workflow. That human action becomes evidence; it does **not** bypass the policy engine or directly flip the result.

### Re-evaluation — new Decision Receipt

The same action is evaluated again through deterministic policy + SERV + core orchestration. A new receipt is created with parent lineage to the original receipt. The action can reach `ALLOW` only if the updated evidence and policy conditions support it.

The explicitly labelled public `/demo` can replay this story without an account using seeded scenario inputs, but it is a secondary sandbox. The finished product's normal workflows do not depend on `/demo`.

See [`demo-script.md`](demo-script.md).

## What judges can verify

### Product routes

- `/` — public product landing page
- `/pricing` — real plan descriptions; no fake checkout
- `/login`, account recovery/verification routes — account lifecycle
- `/onboarding` — operational workspace/integration/policy/SERV/test-action onboarding
- `/dashboard` — Control Center
- `/dashboard/analytics` — operational analytics and downloadable reporting
- `/dashboard/decisions` — Decision Explorer / Receipt Center
- `/dashboard/policies` — Policy Studio lifecycle/versioning/simulation
- `/dashboard/reviews` — operational Human Review workflow
- `/dashboard/integrations` — GitHub App / integration management
- `/dashboard/developers` — API keys, webhooks, SDK setup, request tester
- `/dashboard/notifications` — in-product notification center/preferences
- `/dashboard/audit` — append-only security/activity log
- `/dashboard/settings` — workspace/security/retention administration
- `/dashboard/billing` — plan and real usage visibility
- `/dashboard/data` — workspace export/removal/offboarding controls
- `/dashboard/docs` — in-product product/developer documentation
- `/demo` — optional public sandbox, not a dependency of the main product

### Core code

- `packages/core` — typed contracts, orchestration, review evidence, Decision Receipts
- `packages/policies` — deterministic policy evaluator
- `packages/serv` — SERV Reasoning adapter
- `packages/sdk` — evaluate-before-execute client
- `examples/github-gate` — GitHub evidence adapter / flagship policy pack
- `supabase/migrations` — durable product schema
- `.github/workflows/ci.yml` — repository release gate
- `.github/workflows/production-smoke.yml` — scheduled/manual deployed-production verification

Hosted workspace/project/environment ownership is server-derived. API credentials map to server-owned scopes; callers cannot switch tenants through arbitrary workspace headers.

## Judging map

### Creativity

- Reasoning is used as an **enforcement boundary**, not a chatbot feature.
- Hard facts and non-negotiable restrictions stay deterministic.
- SERV is used specifically for ambiguous policy, exceptions, evidence interpretation, and contradictions.
- Human review becomes new evidence and triggers full re-evaluation instead of bypassing governance.
- Every evaluation generates a lineage-aware, inspectable Decision Receipt.

### User-readiness

- complete account lifecycle and onboarding;
- workspace/project/environment/member RBAC;
- real GitHub App and framework-agnostic Developer API paths;
- production Developer Console with API-key/webhook lifecycle and request testing;
- policy lifecycle, versioning, templates, diffs, activation and simulation;
- operational Human Review queue and evidence workflow;
- searchable Decision Explorer / Receipt Center with integrity verification and exports;
- notifications, email preferences, signed webhooks, retries and delivery history;
- append-only security audit and operational analytics;
- settings, retention, data export/offboarding and server-enforced plan entitlements;
- in-product documentation and contextual help;
- readiness/liveness separation, error recovery, strict Chrome E2E, performance budgets, route/console QA and deployed-production smoke.

### Revenue potential

**Initial buyer:** engineering teams deploying autonomous coding/deployment agents.

**Initial paid value:**

- governed high-impact agent actions;
- managed policies and reusable policy packs;
- human review workflows;
- GitHub/API integrations;
- signed webhooks and automation;
- searchable decision/audit history and operational analytics;
- usage entitlements, retention and administrative controls.

**Expansion path:** customer support, procurement, finance, operations, and other domains where autonomous systems can take consequential actions.

No unsupported TAM, compliance-certification, or formal-security-proof claim is needed for the hackathon story.

## Safety and reliability proof

Automated proof covers, among other cases:

- missing/stale critical evidence → `REVIEW`;
- contradictory evidence → `REVIEW`;
- malformed/unavailable SERV → fallback + `REVIEW`;
- deterministic hard `BLOCK` cannot be overridden by SERV;
- instruction-like text embedded in evidence is treated as untrusted data;
- API-key create/use/revoke and workspace scope boundaries;
- GitHub callback/webhook verification and duplicate-delivery handling;
- real Human Review re-evaluation creates a new receipt and parent lineage;
- forced SERV network failure in browser E2E returns `REVIEW` with fallback provider status, never `ALLOW`;
- every primary dashboard route is browser-visited and console errors fail CI;
- branded route/render recovery states are present.

These are application-level safety/reliability evaluations, not formal security or compliance certification.

See [`evaluation-report.md`](evaluation-report.md) and [`product-qa-2026-09.md`](product-qa-2026-09.md).

## Release-quality proof

The repository release gate is now:

```text
pnpm install --frozen-lockfile
→ lint
→ typecheck
→ full package + web tests
→ production Next.js build
→ real headless-Chrome E2E
→ browser artifact upload
→ release smoke
```

The final #69 product-QA head passed the complete gate before merge.

A separate **Production Smoke** workflow runs every six hours and supports manual dispatch. It receives a production base URL and executes `pnpm release:smoke` from GitHub-hosted infrastructure against the deployed product.

See [`release-checklist.md`](release-checklist.md).

## Capture plan — real product first

Capture screenshots/GIFs from the latest verified production deployment in this order:

1. **Landing hero** — product name, tagline, core value.
2. **Control Center** — real workspace/project/environment scope.
3. **Policy Studio** — one deterministic rule plus one contextual SERV policy/version.
4. **Human Review** — a real `REVIEW` case with missing evidence / reviewer action.
5. **Receipt Center** — exact policy versions, deterministic/SERV findings, evidence, lineage and integrity state.
6. **Operational Analytics** — real outcome/review/evidence/SERV metrics.
7. **Developer Console or Integrations** — API/GitHub readiness without exposing credentials.
8. **Audit / Notifications** — operational history and alerting.

Optional supporting capture:

- `/demo` showing the clearly labelled public sandbox story;
- a 20–40 second clip of `REVIEW → reviewer evidence → re-evaluation → new receipt` in real product state.

Never capture API keys, webhook secrets, provider keys, service-role credentials, private environment values, or unrelated user data.

## Official Edition 01 requirements — re-verified 25 September 2026

Official page states:

- [x] Target track selected: **Open Track** — anything that runs on SERV Reasoning and surprises the judges.
- [x] Project is working and demoable before the deadline.
- [ ] OpenServ organization **data collection is enabled** for eligibility. (Account setting; must be confirmed manually.)
- [ ] A public post is published on the builder's X feed.
- [ ] The post includes the project **name**.
- [ ] The post explains the **concept**.
- [ ] The post includes **images**.
- [ ] The post includes relevant GitHub/live-product links.
- [ ] The post tags **@openservai**.
- [ ] The official submission form is completed **after** the public post.
- [ ] Submission is complete before **28 September 2026 at 00:00 UTC**.

Judging criteria:

1. creativity;
2. user-readiness;
3. revenue potential.

Copy-ready X material lives in [`x-submission-post.md`](x-submission-post.md).

## Deployment verification state

**Repository:** https://github.com/EcstaceeLOR/VetoLayer  
**Known production URL:** https://vetolayer.vercel.app  
**Latest-repo gate:** green through #69  
**Latest-main Vercel deploy:** pending because the Vercel account hit its deployment build-rate limit  
**Fresh Production Smoke:** pending after latest-main deployment

Issue #12 must remain open until:

1. Vercel accepts a deployment containing the latest `main`;
2. the Production Smoke workflow succeeds against `https://vetolayer.vercel.app` (or the final verified production URL);
3. landing/auth/intended product routes are manually spot-checked from the deployed build;
4. final judge screenshots/GIF are captured from that build;
5. the public X post and official form are completed.

## Final pre-submit checklist

### Latest public release

- [ ] Latest `main` is deployed, not an older production commit.
- [ ] Production Smoke succeeds against the deployed URL.
- [ ] `/api/readiness` reports the expected ready state for the intended production configuration.
- [ ] `/api/health` exposes no secrets.
- [ ] Sign-in/onboarding/control-center paths behave correctly.
- [ ] SERV credentials are server-side and contextual evaluations use the configured provider.

### Flagship proof

- [ ] First real action returns safe `REVIEW` when required evidence is missing.
- [ ] Human Review adds evidence instead of overriding the engine.
- [ ] Same action is fully re-evaluated.
- [ ] Re-evaluation produces a new Decision Receipt with lineage.
- [ ] Provider fallback is not presented as successful contextual reasoning.
- [ ] Receipt integrity verification succeeds.

### Product/security hygiene

- [ ] GitHub/Developer API integration used in the presentation reports the expected readiness state.
- [ ] No caller-controlled workspace header exists in the SDK contract.
- [ ] Browser console stays clean through presentation routes.
- [ ] No server secret appears in client assets/network responses/screenshots.
- [ ] Repository is public.

### Submission

- [ ] Final screenshots/GIF use the verified deployment.
- [ ] X post uses verified GitHub + production links and tags `@openservai`.
- [ ] OpenServ data-collection eligibility is enabled.
- [ ] Official form is submitted after the X post and before the deadline.

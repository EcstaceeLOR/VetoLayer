# VetoLayer — SERV Hackathon submission kit

Last verified against the Edition 01 hackathon page: **24 September 2026**.

## Project identity

**Name:** VetoLayer  
**Track:** Open Track  
**Tagline:** Agents can think freely. They shouldn't act freely.  
**One-line pitch:** VetoLayer is a pre-execution reasoning and approval layer that decides whether autonomous AI agents should perform high-impact actions given policy, evidence, exceptions, and current context.

## 60-second project description

Autonomous agents increasingly have permission to merge code, deploy production, modify protected systems, and trigger business actions. Traditional authorization answers whether an agent *can* act; it does not reliably answer whether the agent *should* act right now.

VetoLayer sits between an agent and a high-impact tool. Hard restrictions are evaluated deterministically. When policy depends on context, evidence, exceptions, ambiguity, or contradictions, VetoLayer routes that judgment to SERV Reasoning. The final result is a typed `ALLOW`, `REVIEW`, or `BLOCK` decision plus a tamper-evident Decision Receipt explaining which policies and evidence mattered.

The initial product wedge is AI coding/deployment agents. The same framework can later govern refunds, purchases, privileged configuration, procurement, finance, and other high-impact autonomous actions.

## Why SERV is necessary

VetoLayer deliberately does **not** ask SERV to solve problems that deterministic code can solve.

SERV is used when the policy question looks like:

> Production deployments are normally restricted during a change freeze, except for critical security remediation when the incident is verified, required checks pass, and the appropriate human approval is present.

That is not just a threshold check. It requires interpretation of policy intent, supplied evidence, exception criteria, missing information, and contradictions.

VetoLayer sends SERV a normalized contextual bundle and requires structured output containing policy findings, evidence usage, missing evidence, contradiction analysis, exception analysis, rationale, and an outcome recommendation. The result is schema-validated and grounded before the core orchestrator can use it.

Hard deterministic `BLOCK`s retain precedence. SERV/provider failure safely degrades to `REVIEW`.

## Flagship scenario

An autonomous coding agent proposes a production deployment that changes authentication/security code during a restricted deployment window.

Context:

- a critical production security incident is active
- the patch changes sensitive auth/security paths
- CI and security checks pass
- the policy has a documented emergency exception
- security-lead approval is initially missing

First evaluation: **REVIEW**.

The security lead then approves. That approval is added as new verified evidence and the **same proposed action** is re-evaluated through the same deterministic + SERV + orchestrator pipeline.

Second evaluation: **ALLOW**.

The UI does not flip the state manually. The evidence changes and VetoLayer reasons again.

See [`demo-script.md`](demo-script.md).

## Judging map

### Creativity

- VetoLayer treats reasoning as an enforcement boundary rather than a chatbot experience.
- It separates deterministic policy enforcement from contextual SERV judgment.
- Human review becomes new evidence and triggers re-evaluation instead of directly overriding the system.
- Every decision produces an inspectable, tamper-evident receipt.

### User-readiness

- polished landing/onboarding flow
- decision Control Center
- Policy Studio
- Human Review Inbox
- real GitHub PR evidence adapter
- framework-agnostic Developer API
- lightweight TypeScript SDK
- optional durable receipt persistence
- health, rate-limit, validation, and error handling for the public MVP

### Revenue potential

Initial buyer/user: engineering teams deploying increasingly autonomous coding agents.

Initial paid value:

- governed high-impact agent actions
- reusable policy packs
- human review workflows
- decision/audit history
- integrations and developer API usage

Expansion path: customer support, procurement, finance, operations, and other domains where agents can take consequential actions.

No market-size or compliance-certification claims are required for the hackathon story.

## Safety/evaluation proof

Automated evaluations cover:

- missing critical evidence
- stale evidence
- contradictory evidence
- malformed SERV output
- unavailable SERV provider
- contextual exception fully satisfied
- contextual exception missing one condition
- deterministic hard `BLOCK` versus contextual allow
- instruction-like/prompt-injection-like text embedded in untrusted evidence
- irrelevant evidence attempting to influence a blocked action

See [`evaluation-report.md`](evaluation-report.md).

## Repository proof points

A judge who wants to verify the core implementation should start here:

- `packages/policies` — deterministic policy evaluator
- `packages/serv` — SERV Reasoning adapter
- `packages/core/src/orchestrator.ts` — final precedence and decision composition
- `packages/core` Decision Receipt implementation — integrity/audit artifact
- `examples/github-gate` — real GitHub integration and flagship policy pack
- `apps/web` — product UI, demo, Policy Studio, Human Review, and API routes
- `packages/sdk` — evaluate-before-execute developer client

## Capture checklist

Before the public X post and submission form, capture these assets from the deployed product:

1. **Landing hero** — VetoLayer name/tagline and core value proposition.
2. **Demo: first evaluation** — high-risk deployment showing `REVIEW` and the missing approval.
3. **Decision Receipt / reasoning trace** — SERV contextual findings, evidence, and integrity marker.
4. **Demo: second evaluation** — same action after approval evidence, showing `ALLOW`.
5. **Policy Studio** — one deterministic rule and one SERV-contextual policy visible.
6. **Human Review Inbox** — review case with evidence/context visible.

Optional: record a 20–40 second GIF showing `REVIEW → add approval evidence → re-evaluate → ALLOW`.

Do not use screenshots containing API keys, tokens, service-role credentials, or private environment values.

## Official Edition 01 submission checklist

The public hackathon page currently requires:

- [ ] Project is new, working, and demoable by **28 September 2026**.
- [ ] Data collection is enabled in the OpenServ organization settings for eligibility.
- [ ] Submission is for the **Open Track**: anything that runs on SERV Reasoning and surprises the judges.
- [ ] Public post is published on the builder's X feed.
- [ ] X post includes the project **name**.
- [ ] X post explains the **concept**.
- [ ] X post includes **images**.
- [ ] X post includes relevant links such as GitHub and live demo.
- [ ] X post tags **@openservai**.
- [ ] Official submission form is completed after the public post.
- [ ] Submission is completed before **28 September 2026 00:00 UTC**.

Current judging criteria:

1. creativity
2. user-readiness
3. revenue potential

## Deployment-dependent fields

**Repository:** https://github.com/EcstaceeLOR/VetoLayer  
**Live demo:** `PENDING_PUBLIC_DEPLOYMENT`  
**Demo route after deployment:** `/demo`

Do not replace `PENDING_PUBLIC_DEPLOYMENT` with an assumed domain. Verify the deployed URL first.

## X post structure

Keep the public post concise enough to scan while covering the required fields:

1. hook/problem
2. `VetoLayer` name + one-line concept
3. what SERV actually reasons about
4. flagship `REVIEW → evidence changes → ALLOW` demo
5. real-product surfaces / market wedge
6. images or short demo clip
7. GitHub + verified live demo links
8. tag `@openservai`

## Final pre-submit verification

- [ ] Public deployment opens successfully in a logged-out browser.
- [ ] `/demo` loads without developer intervention.
- [ ] SERV credentials are configured server-side.
- [ ] First demo stage returns the expected safe outcome.
- [ ] Second stage re-runs the pipeline after evidence changes.
- [ ] Provider fallback is not disguised as successful SERV reasoning.
- [ ] Decision Receipt is generated.
- [ ] No secret values appear in browser output or screenshots.
- [ ] GitHub repository is public.
- [ ] README points to the verified live URL once available.
- [ ] X post uses the verified live URL.
- [ ] Official form is submitted after the X post.

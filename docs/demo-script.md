# VetoLayer flagship demo script

Target length: **2–3 minutes**.

The demo should prove one thing clearly: **an autonomous agent can have permission to act and still need contextual judgment before the action is safe to execute.**

Run the core story entirely on `/demo` in a logged-out/private browser. The judge should not need an account, terminal, or developer intervention.

## 0:00–0:20 — The problem

Open the VetoLayer landing page.

Say:

> Autonomous agents are getting permission to merge code, deploy production, issue refunds, and call high-impact tools. Access control can tell us whether an agent *can* act. VetoLayer asks whether it *should* act right now, given policy, evidence, exceptions, and context.

Move immediately to `/demo`.

## 0:20–0:45 — Proposed action

Point out the explicit **DEMO MODE** label. Be precise about the trust boundary:

- PR metadata is seeded
- incident context is seeded
- CI state is seeded
- security-lead review evidence is seeded when added
- deterministic evaluation is real
- SERV is called live
- orchestration is real
- Decision Receipt generation is real

Show the initial facts:

- autonomous coding agent proposes production deploy
- restricted deployment window is active
- critical session-token replay incident is active
- auth/security files changed
- CI/security checks pass
- security-lead approval is missing

## 0:45–1:20 — First evaluation

Click **1. Evaluate current action**.

Expected result with SERV configured: **REVIEW**.

Show:

1. deterministic checks
2. contextual policy routed to SERV
3. SERV reasoning over exception + supplied evidence
4. missing security-lead approval
5. final `REVIEW`
6. Decision Receipt and integrity hash

Key line:

> VetoLayer did not decide that the agent lacked permission. It decided that the evidence was not yet sufficient to justify the exception.

If the provider trace reports fallback, do not pretend the live SERV call succeeded. A fallback must remain safe `REVIEW`.

## 1:20–1:50 — Human review becomes evidence

Stay on the same public page. Click **2. Add demo security-lead approval & re-evaluate**.

Explain:

> This is clearly labelled seeded demo approval evidence. It is represented as a HumanReviewRecord; it does not directly flip the UI or override policy. VetoLayer re-runs the same deterministic + SERV + orchestrator pipeline with the new evidence.

Expected result when the exception is supported: **ALLOW**.

Show that the proposed action, files, incident, and CI state remain unchanged. The material change is the newly supplied approval evidence. Point out the new receipt hash.

Use **Reset demo** between repeated presentations; reset calls the server reset endpoint rather than merely clearing browser state.

## 1:50–2:15 — Why SERV matters

Use the visible provider/decision trace or briefly open the contextual policy in Policy Studio.

Say:

> Hard restrictions stay deterministic. SERV is used only when policy requires contextual judgment: interpreting exceptions, weighing supplied evidence, identifying missing information, and explaining why a condition does or does not apply.

Mention that malformed/unavailable SERV results safely become `REVIEW`, and hard deterministic `BLOCK`s cannot be overridden by SERV.

## 2:15–2:40 — Prove this is a product

Only after the core demo is complete, briefly show:

- **Control Center** — receipt-derived decisions and decision health
- **Policy Studio** — deterministic + SERV-contextual policy authoring
- **Human Review Inbox** — authenticated real-user review workflow
- **Integrations** — GitHub/API readiness without exposing credentials
- **Authenticated workspace** — server-derived workspace ownership

Mention that Developer API + TypeScript SDK provide the same evaluate-before-execute boundary for other agent frameworks.

## 2:40–3:00 — Close on proof

End on the second Decision Receipt or the Control Center.

> VetoLayer is the decision layer between agent intelligence and real-world authority: deterministic where the answer is deterministic, SERV-powered where judgment is required, and auditable either way.

Optional final proof line:

> Every release is gated by lint, typecheck, tests, a production build, and release smoke; the deployed smoke check also refuses to mark the demo ready unless SERV is configured.

## Demo integrity rules

- Do not call the scenario inputs live GitHub production data; they are seeded.
- Do not claim a live SERV result when provider status is fallback.
- Do not describe the receipt hash as blockchain notarization, legal certification, or cryptographic immutability.
- Do not claim VetoLayer replaces IAM, authorization, security review, or compliance tooling.
- Do not expose GitHub, SERV, Supabase, or VetoLayer API credentials in screenshots or browser output.
- Keep the core story on one proposed action before touring secondary product surfaces.

# VetoLayer flagship demo script

Target length: **2–3 minutes**.

The goal is not to tour every screen. The demo should prove one thing clearly: **an autonomous agent can have permission to act and still need contextual judgment before the action is safe to execute.**

## 0:00–0:20 — The problem

Open the VetoLayer landing page.

Say:

> Autonomous agents are getting permission to merge code, deploy production, issue refunds, and call high-impact tools. Access control can tell us whether an agent *can* act. VetoLayer asks whether it *should* act right now, given policy, evidence, exceptions, and context.

Move immediately to `/demo`.

## 0:20–0:45 — Proposed action

Point out the explicit **DEMO MODE** label. The scenario inputs are seeded for reliability, but the decision pipeline is real.

Show:

- actor: autonomous coding agent
- action: deploy production
- target: identity/authentication service
- restricted deployment window: active
- critical incident: active session-token replay weakness
- sensitive authentication/security files changed
- CI/security checks: passing
- security-lead approval: missing

Explain that the company normally restricts production changes in this window, but allows a narrowly defined emergency security exception if the required evidence is present.

## 0:45–1:20 — First evaluation

Run the first evaluation.

Expected result: **REVIEW**.

Show:

1. deterministic checks
2. the contextual policy routed to SERV
3. SERV reasoning over the exception and evidence
4. missing security-lead approval
5. VetoLayer final `REVIEW`
6. Decision Receipt and integrity hash

Key line:

> VetoLayer did not decide that the agent lacked permission. It decided that the evidence was not yet sufficient to justify the exception.

## 1:20–1:50 — Human review becomes evidence

Open the Human Review case when the `REVIEW` result creates one.

Record the authorized security approval. Emphasize:

> We do not bypass VetoLayer by clicking “approve.” Human review becomes new verified evidence and the same deterministic + SERV + orchestrator path runs again.

Re-run the evaluation.

Expected result: **ALLOW**.

Show that the action, commit, files, incident, and CI evidence are unchanged; the material difference is the newly satisfied approval requirement.

If presenting repeatedly, use **Reset demo** between runs so the seeded story returns to its first state cleanly.

## 1:50–2:15 — Why SERV matters

Open the reasoning/provider trace or the contextual policy in Policy Studio.

Say:

> Hard restrictions stay deterministic. SERV is used only when policy requires contextual judgment: interpreting exceptions, weighing supplied evidence, identifying missing information, and explaining why a condition does or does not apply.

Point out that malformed/unavailable SERV results safely become `REVIEW`, and hard deterministic `BLOCK`s cannot be overridden by SERV.

## 2:15–2:40 — Prove this is a product

Keep this section fast. Show only enough to establish user-readiness:

- **Control Center** — real decisions plus receipt-derived decision health
- **Policy Studio** — deterministic and SERV-contextual policy authoring
- **Human Review Inbox** — review as evidence + re-evaluation
- **Integrations** — GitHub/API readiness without exposing credentials
- **Authenticated workspace** — product data is server-scoped to the signed-in owner

Mention that the Developer API and TypeScript SDK provide the same evaluate-before-execute boundary for other agent frameworks.

Say:

> GitHub deployments are our first market wedge, but the decision contract is horizontal. The same gate can sit in front of refunds, purchases, privileged configuration, procurement, finance, or other high-impact agent actions.

## 2:40–3:00 — Close on proof

End on the Decision Receipt or Control Center.

Closing line:

> VetoLayer is the decision layer between agent intelligence and real-world authority: deterministic where the answer is deterministic, SERV-powered where judgment is required, and auditable either way.

Optional final proof line:

> Every release is gated by lint, typecheck, tests, a production build, and a lightweight release smoke check.

## Demo integrity rules

- Do not claim the UI result is live if SERV credentials are not configured.
- Do not hide provider fallback; show `REVIEW` if SERV is unavailable.
- Do not imply seeded scenario inputs are live GitHub production data.
- Do not describe the Decision Receipt hash as blockchain notarization, legal certification, or cryptographic immutability.
- Do not claim VetoLayer replaces IAM, authorization, security review, or compliance tooling.
- Do not expose GitHub, SERV, Supabase, or VetoLayer API credentials in screenshots or browser output.
- Keep the flagship story on one proposed action; avoid unrelated feature tours until the before/after result is understood.

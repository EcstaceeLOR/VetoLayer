# VetoLayer flagship demo script

Target length: **2–3 minutes**.

The goal is not to tour every screen. The demo should prove one thing clearly: **an autonomous agent can have permission to act and still need contextual judgment before the action is safe to execute.**

## 0:00–0:20 — The problem

Open the VetoLayer landing page.

Say:

> Autonomous agents are getting permission to merge code, deploy production, issue refunds, and call high-impact tools. Access control can tell us whether an agent *can* act. VetoLayer asks whether it *should* act right now, given policy, evidence, exceptions, and context.

Move immediately to `/demo`.

## 0:20–0:45 — Proposed action

Show the seeded scenario:

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

1. deterministic checks passed/failed
2. the contextual policy routed to SERV
3. SERV reasoning over the exception and evidence
4. missing security-lead approval
5. VetoLayer final `REVIEW`
6. Decision Receipt and integrity hash

Key line:

> VetoLayer did not decide that the agent lacked permission. It decided that the evidence was not yet sufficient to justify the exception.

## 1:20–1:50 — Evidence changes, not the UI

Use the Human Review flow / resolved demo stage to add the security-lead approval as verified evidence.

Emphasize:

> We do not override the decision by clicking “approve.” Human review becomes new evidence and the same deterministic + SERV + orchestrator path runs again.

Re-run the evaluation.

Expected result: **ALLOW**.

Show that the proposed action, commit, files, and CI evidence are unchanged; the material difference is the newly satisfied approval requirement.

## 1:50–2:15 — Why SERV matters

Open the reasoning/provider trace or Policy Studio.

Say:

> Hard restrictions stay deterministic. SERV is used only when policy requires contextual judgment: interpreting exceptions, weighing supplied evidence, identifying missing information, and explaining why a condition does or does not apply.

Point out that malformed/unavailable SERV results safely become `REVIEW`, and hard deterministic `BLOCK`s cannot be overridden by SERV.

## 2:15–2:40 — Product proof

Briefly show:

- Control Center / decisions
- Policy Studio
- Human Review Inbox
- Developer API / SDK integration surface

Say:

> GitHub deployments are our first market wedge, but the decision contract is horizontal. The same gate can sit in front of refunds, purchases, privileged configuration, or other high-impact agent actions.

## 2:40–3:00 — Close

End on the Decision Receipt or landing page.

Closing line:

> VetoLayer is the decision layer between agent intelligence and real-world authority: deterministic where the answer is deterministic, SERV-powered where judgment is required, and auditable either way.

## Demo integrity rules

- Do not claim the UI result is live if SERV credentials are not configured.
- Do not hide provider fallback; show `REVIEW` if SERV is unavailable.
- Do not describe the Decision Receipt hash as blockchain notarization or legal certification.
- Do not claim VetoLayer replaces IAM, authorization, security review, or compliance tooling.
- Keep the flagship story on one proposed action; avoid unrelated feature tours until the core before/after result is understood.

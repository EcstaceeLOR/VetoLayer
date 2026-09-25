# Operational onboarding

VetoLayer onboarding is a product activation flow, not a tour. It ends only when an authenticated user has a real workspace scope, a verified execution path, persisted policies, live SERV contextual reasoning, and a scoped Decision Receipt produced by the real decision pipeline.

## Eight checkpoints

1. **Workspace** — create or select an active workspace the signed-in user belongs to.
2. **Project** — create or select an active project inside that workspace.
3. **Environment + use case** — choose the exact operating environment and a coding, support, or finance use case.
4. **Integration** — install/select a real GitHub App connection for this exact scope, or verify the Developer API path.
5. **Policy pack** — persist the recommended deterministic + contextual starter pack, or select existing persisted policies that include contextual judgment.
6. **SERV** — verify that `SERV_API_KEY` and `SERV_MODEL` are configured without returning either secret to the browser.
7. **Test action** — evaluate operator-supplied action context through `evaluateDeterministicPolicies`, `evaluateWithServ`, and `evaluateAction`.
8. **Decision Receipt** — persist and inspect the resulting persisted receipt in the selected workspace/project/environment.


## Completion is revalidated, never trusted

`vetolayer_onboarding_states` stores resume selections such as the chosen workspace ID, project ID, environment ID, use case, integration choice, selected policy IDs, last visible step, and final receipt ID. Those values are **not** treated as proof that a step is complete.

Every load revalidates the underlying product state:

- workspace still exists, is active, and the user is still a member;
- project still belongs to the workspace and is active;
- environment still belongs to that project and is active;
- selected integration has a persisted scoped connection status that is not `needs-config`;
- a GitHub choice therefore requires a verified App installation with at least one repository selected for the exact scope;
- every selected policy still exists in the scoped durable policy store;
- SERV is still configured;
- final receipt exists, is not a persisted receipt, and belongs to the exact selected project/environment.

Changing workspace, project, environment, use case, or integration invalidates downstream onboarding state so stale setup cannot remain marked complete. GitHub uninstall/suspend events also update the scoped integration record back to `needs-config`, so onboarding will no longer treat a revoked installation as complete.

## Live SERV requirement

Configuration presence is checked in Step 6, but onboarding is not considered operational on that signal alone.

Step 7 requires a contextual policy and invokes the real SERV adapter. The evaluation may safely fall back to `REVIEW` when SERV is unavailable, but onboarding only records completion when the orchestration trace reports:

```text
providerStatus: ok
```

A fallback receipt is still persisted for auditability, but it does not satisfy completion. The user gets an actionable error and may retry after fixing credentials, model access, or network connectivity.

## Test action safety

The onboarding test evaluates an action but does not execute an external tool operation. Its purpose is to prove the control path before the user places VetoLayer in front of a production tool.

The action includes:

- authenticated user-selected scope;
- selected integration identity;
- operator-supplied target and reason;
- a use-case-specific action type;
- verified operator-context evidence;
- deterministic facts;
- the user's persisted policies.

The resulting receipt is hashed through the standard Decision Receipt implementation and stored as a normal `source: api` decision, not a seeded onboarding object.

For GitHub-specific live evidence after activation, the Integrations surface can evaluate a connected pull request through the GitHub App installation and the existing GitHub Gate. That flow persists the result as `source: integration` and creates a real Human Review case when required.

## Starter policy packs

Each starter pack contains at least:

- one deterministic enforcement policy;
- one contextual policy routed to SERV.

Available packs:

- Coding & deployment agents — protected-change review + contextual release judgment.
- Customer support agents — high-value action review + contextual support exception judgment.
- Finance & procurement agents — large financial action review + contextual execution judgment.

Starter policies are ordinary Policy Studio records. Users can edit them after onboarding.

## Resume and restart

The current step is saved server-side when durable persistence is configured. On return, VetoLayer resumes the requested step only when every earlier prerequisite still validates. If something was removed or disconnected, onboarding returns to the earliest incomplete checkpoint.

Restarting onboarding deletes only the user's `vetolayer_onboarding_states` row. It does **not** delete:

- workspaces;
- projects or environments;
- members;
- policies;
- integrations;
- GitHub App installations/repository connections;
- reviews;
- decisions or Decision Receipts.

That makes restart safe even for a partially configured production organization.

## Production database

Apply the onboarding state migration after the workspace model, and apply the GitHub App migration when GitHub is enabled:

```text
supabase/migrations/202609250600_onboarding_state.sql
supabase/migrations/202609250800_github_app.sql
```

`vetolayer_onboarding_states` stores one resume row per authenticated Supabase user. RLS remains enabled and no browser/public write policy is added; VetoLayer accesses the row server-side after authenticating the user.

Production onboarding fails closed when durable Supabase persistence is not configured.

## Relationship to product integrations

Issue #56 upgrades the GitHub checkpoint to a real GitHub App installation/repository lifecycle. Issue #57 will replace the interim environment-backed Developer API key with first-class customer API keys and a developer console.

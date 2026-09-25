# Policy Studio lifecycle

Policy Studio is the product source of truth for project governance. Issue #58 replaces mutable policy blobs with an explicit publication lifecycle so a rule that governed a historical action can never be silently rewritten later.

## Lifecycle

Each logical policy has immutable numbered versions and one of three states:

- **Draft** — editable and safe to simulate, but never included in live governance.
- **Active** — published and used for matching evaluations in its selected project environments.
- **Archived** — immutable historical version. An archived version can be reactivated to roll back.

A logical policy can have at most one Active version and one editable Draft at a time. Editing an Active or Archived version always creates a new Draft with a higher version number.

Activation is atomic. Publishing a candidate version archives the prior Active version for that logical policy and activates the candidate in one database transaction. Version rows keep their original policy content, targets, publication timestamps, source template, base-version reference, and change note.

## Exact receipt linkage

For live evaluation, an Active managed version is materialized with a version identity such as:

```text
policy_abc123@v4
```

That exact identifier flows through deterministic/contextual findings and the signed Decision Receipt. The receipt therefore preserves the exact version evaluated. Decision detail pages deep-link back to the same historical Policy Studio version.

## Project and environment targeting

Policies belong to a workspace project and select one or more project environment IDs. Only Active versions targeted to the API key/integration's current environment are loaded for live evaluation.

The policy's normal runtime `scope` still controls action types, tools, and action environment labels. Project-environment targeting and runtime action scope are separate controls.

## Developer API authority

Once a project/environment has Active managed policy versions, those versions are authoritative for Developer API evaluations. Caller-supplied policies are ignored in that governed scope so an API client cannot inject a permissive policy.

If there are no Active managed versions, request-supplied policies remain available as a backwards-compatible migration path. If neither exists, evaluation fails closed with `POLICIES_REQUIRED`.

The GitHub gate preserves its trusted built-in safety policies alongside managed project policies. Those built-ins are product code rather than caller-controlled input.

## Safe activation

Before activation, Policy Studio validates the version and reports conflicts/warnings, including:

- no target project environment (blocking)
- overlapping deterministic policies with incompatible outcomes
- same-priority overlapping policies
- broad tool/action scope
- contextual policies with no evidence requirements
- explicit ALLOW rules that deserve narrow review

Blocking conflicts prevent activation. Non-blocking warnings require explicit confirmation.

## Templates

Templates are starting points, not hidden runtime rules. Choosing a template creates a normal Draft that can be edited, simulated, versioned, duplicated, and activated like any other policy.

The initial template library includes source-control, deployment, security-context, protected-configuration, and high-value-payment controls.

## Simulation

Drafts and historical versions can be simulated without changing lifecycle state.

- **Sample action** uses the maintained Policy Studio sample action/evidence bundle.
- **Historical action** loads a Decision Receipt from the selected project/environment and replays the action identity plus preserved evidence.

Decision Receipts do not preserve every arbitrary `facts` value originally submitted by an API caller. Historical simulation derives common facts from preserved evidence and clearly surfaces that limitation instead of pretending to be an exact replay.

## Persistence and migration

Apply:

```text
supabase/migrations/202609251100_policy_lifecycle.sql
```

The migration creates `vetolayer_policy_versions`, indexes one Active and one Draft version per logical policy, enables RLS, removes direct browser grants, migrates previously scoped legacy policy rows into immutable v1 history, and installs the server-only fork/activation RPCs.

The old `vetolayer_policies` table remains as migration history for older deployments; new Policy Studio writes go to the lifecycle store.

## Authorization

- `policies.read` can inspect policies, versions, diffs, and run simulations.
- `policies.write` can create/update Drafts, duplicate, activate, deactivate, and roll back versions.
- Archived projects reject lifecycle mutations.

Owners/admins currently receive `policies.write`; reviewer/member behavior continues to follow the workspace permission model.

# Policy Studio

Policy Studio is the user-facing authoring surface for VetoLayer's existing `Policy` contract. It does not introduce a second rules format.

## Modes

- **Deterministic** — conditions, match strategy, and an explicit allow/review/block effect. These run only through `@vetolayer/policies`.
- **SERV contextual** — instruction, decision criteria, required evidence, and documented exceptions. These are routed by the core orchestrator to the existing SERV adapter.

## Test mode

`POST /api/policies/simulate` validates the policy with `PolicySchema` and executes the same `evaluateAction(...)` pipeline used by product decisions. The built-in sample is the flagship production deployment context. A SERV-backed policy therefore uses the real configured SERV provider; provider/configuration failure safely becomes `REVIEW` through the existing orchestrator behavior.

## Persistence

When Supabase persistence is configured, `POST /api/policies` upserts into `vetolayer_policies`. Without server persistence, the Policy Studio clearly reports browser-fallback mode and stores authored policy state in local storage so refreshes do not erase the MVP workflow.

Suggested table:

```sql
create table if not exists public.vetolayer_policies (
  id text primary key,
  workspace_id text not null,
  policy jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists vetolayer_policies_workspace_idx
  on public.vetolayer_policies (workspace_id, updated_at desc);
```

The browser never receives the Supabase service-role credential; durable reads/writes are server-only.

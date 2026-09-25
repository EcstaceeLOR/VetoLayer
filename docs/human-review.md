# Human Review Inbox

A `REVIEW` outcome pauses the proposed action and creates a review case. Human review is deliberately modeled as **evidence**, not an override.

## Safety model

1. The original VetoLayer decision must be `REVIEW` to enter this workflow.
2. A reviewer records `approve`, `reject`, or `request_evidence`, plus a rationale and identity.
3. The review is added to the verified review-state evidence bundle.
4. VetoLayer runs the same deterministic policy engine, SERV contextual evaluator, and decision orchestrator again.
5. The resulting `Decision Receipt` contains the review-state evidence, including reviewer identity, timestamp, action, and rationale.
6. A human rejection is an explicit deterministic hard BLOCK. SERV cannot override it.
7. A request for more evidence remains REVIEW even if contextual reasoning would otherwise allow.
8. A human approval is necessary evidence where policy requires it, but it does not guarantee ALLOW; all other policies and contextual criteria still apply.

This preserves the key invariant: humans can change the evidence/context used by policy, but cannot bypass hard policy by clicking a button.

## Production review workflow

The first `/api/v1/evaluate` run creates a review case when the production security patch returns REVIEW. The judge-facing example then hands the user to `/dashboard/reviews`, where the human action is recorded and the real pipeline runs again. The UI no longer directly flips the seeded scenario into a resolved state.

## Persistence

When server persistence is configured, review cases use the `vetolayer_review_cases` table. In local development, the review workflow can use a process-local review store so the end-to-end workflow remains usable in local/example environments.

Suggested table:

```sql
create table if not exists public.vetolayer_review_cases (
  id text primary key,
  workspace_id text not null,
  status text not null check (status in ('pending', 'resolved')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vetolayer_review_cases_workspace_idx
  on public.vetolayer_review_cases (workspace_id, updated_at desc);
```

The review API uses the same server-only Supabase credential boundary as Decision Receipt persistence.

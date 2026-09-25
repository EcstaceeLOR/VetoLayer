-- Issue #59: operational human-review workflow.
-- The existing review payload remains the complete application record; indexed
-- columns provide optimistic concurrency and queue filtering without exposing
-- review data directly to browser roles.

create table if not exists public.vetolayer_review_cases (
  id text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text references public.vetolayer_projects(id) on delete cascade,
  environment_id text references public.vetolayer_environments(id) on delete cascade,
  status text not null default 'pending',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vetolayer_review_cases
  add column if not exists revision integer not null default 1,
  add column if not exists assignee_user_id text,
  add column if not exists due_at timestamptz;

alter table public.vetolayer_review_cases
  drop constraint if exists vetolayer_review_cases_status_check;
alter table public.vetolayer_review_cases
  add constraint vetolayer_review_cases_status_check
  check (status in ('pending', 'awaiting_evidence', 'resolved'));

update public.vetolayer_review_cases
set revision = greatest(1, coalesce(revision, 1)),
    due_at = coalesce(due_at, created_at + interval '24 hours')
where revision is null or revision < 1 or due_at is null;

create index if not exists vetolayer_review_cases_queue_idx
  on public.vetolayer_review_cases (workspace_id, project_id, environment_id, status, updated_at desc);
create index if not exists vetolayer_review_cases_assignee_idx
  on public.vetolayer_review_cases (workspace_id, project_id, environment_id, assignee_user_id, status);
create index if not exists vetolayer_review_cases_due_idx
  on public.vetolayer_review_cases (workspace_id, project_id, environment_id, due_at)
  where status <> 'resolved';

alter table public.vetolayer_review_cases enable row level security;
revoke all on table public.vetolayer_review_cases from anon, authenticated;

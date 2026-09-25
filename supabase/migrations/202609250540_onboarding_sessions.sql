create table if not exists public.vetolayer_onboarding_sessions (
  user_id text primary key,
  workspace_id text null,
  project_id text null,
  environment_id text null,
  draft_workspace_name text null,
  draft_project_name text null,
  use_case text null check (use_case is null or use_case in ('coding', 'support', 'finance')),
  integration text null check (integration is null or integration in ('github', 'developer-api')),
  policy_ids jsonb not null default '[]'::jsonb,
  first_receipt_id text null,
  skipped_steps jsonb not null default '[]'::jsonb,
  completed_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists vetolayer_onboarding_sessions_workspace_idx
  on public.vetolayer_onboarding_sessions (workspace_id, project_id, environment_id);

alter table public.vetolayer_onboarding_sessions enable row level security;

comment on table public.vetolayer_onboarding_sessions is
  'Server-managed setup intent and resume state. Completion is derived from real VetoLayer resources, not these flags.';

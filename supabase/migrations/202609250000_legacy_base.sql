-- VetoLayer legacy persistence baseline.
-- These tables predate the Issue #54 workspace model and are required by the
-- later migrations that add scoped columns, indexes, and lifecycle metadata.

create table if not exists public.vetolayer_decisions (
  id text primary key,
  workspace_id text not null,
  source text not null check (source in ('api', 'integration')),
  receipt jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vetolayer_policies (
  id text primary key,
  workspace_id text not null,
  policy jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.vetolayer_review_cases (
  id text primary key,
  workspace_id text not null,
  status text not null check (status in ('pending', 'resolved')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vetolayer_integration_configs (
  id text primary key,
  workspace_id text not null,
  integration text not null,
  state text not null check (state in ('ready', 'warning', 'needs-config')),
  account text,
  last_code text,
  updated_at timestamptz not null default now()
);

create index if not exists vetolayer_decisions_workspace_idx
  on public.vetolayer_decisions (workspace_id, created_at desc);
create index if not exists vetolayer_policies_workspace_idx
  on public.vetolayer_policies (workspace_id, updated_at desc);
create index if not exists vetolayer_review_cases_workspace_idx
  on public.vetolayer_review_cases (workspace_id, updated_at desc);
create index if not exists vetolayer_integration_configs_workspace_idx
  on public.vetolayer_integration_configs (workspace_id, updated_at desc);

alter table public.vetolayer_decisions enable row level security;
alter table public.vetolayer_policies enable row level security;
alter table public.vetolayer_review_cases enable row level security;
alter table public.vetolayer_integration_configs enable row level security;

revoke all on table public.vetolayer_decisions from anon, authenticated;
revoke all on table public.vetolayer_policies from anon, authenticated;
revoke all on table public.vetolayer_review_cases from anon, authenticated;
revoke all on table public.vetolayer_integration_configs from anon, authenticated;

grant select, insert, update, delete on table public.vetolayer_decisions to service_role;
grant select, insert, update, delete on table public.vetolayer_policies to service_role;
grant select, insert, update, delete on table public.vetolayer_review_cases to service_role;
grant select, insert, update, delete on table public.vetolayer_integration_configs to service_role;

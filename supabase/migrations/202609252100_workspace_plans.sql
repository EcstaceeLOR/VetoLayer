create table if not exists public.vetolayer_workspace_plans (
  workspace_id text primary key references public.vetolayer_workspaces(id) on delete cascade,
  plan_id text not null default 'developer' check (plan_id in ('developer', 'team', 'scale')),
  source text not null default 'system' check (source in ('system', 'manual', 'billing')),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vetolayer_workspace_plans_plan_idx
  on public.vetolayer_workspace_plans(plan_id, updated_at desc);

alter table public.vetolayer_workspace_plans enable row level security;
revoke all on table public.vetolayer_workspace_plans from anon, authenticated;

comment on table public.vetolayer_workspace_plans is
  'Server-owned workspace commercial plan assignment. Paid checkout is intentionally absent until a real billing provider is configured.';

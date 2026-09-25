-- VetoLayer Issue #56: production GitHub App installation metadata.
-- Credentials are intentionally absent. User OAuth tokens and installation tokens
-- are ephemeral and must never be persisted in this table.

create table if not exists public.vetolayer_github_installations (
  id text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  environment_id text not null references public.vetolayer_environments(id) on delete cascade,
  installation_id bigint not null check (installation_id > 0),
  account_login text not null,
  account_id bigint not null check (account_id > 0),
  account_type text not null,
  account_url text,
  installation_url text,
  repository_selection text not null check (repository_selection in ('all', 'selected')),
  status text not null default 'active' check (status in ('active', 'suspended', 'uninstalled', 'error')),
  permissions jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  repositories jsonb not null default '[]'::jsonb,
  connected_by_user_id uuid not null references auth.users(id) on delete restrict,
  suspended_at timestamptz,
  last_synced_at timestamptz,
  last_event text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, project_id, environment_id, installation_id)
);

create index if not exists vetolayer_github_installations_scope_idx
  on public.vetolayer_github_installations (workspace_id, project_id, environment_id, status, updated_at desc);

create index if not exists vetolayer_github_installations_installation_idx
  on public.vetolayer_github_installations (installation_id, status);

alter table public.vetolayer_github_installations enable row level security;

-- The application currently uses the Supabase service-role key only from server
-- code after validating authenticated membership, role, and product scope. Keep
-- direct browser roles away from installation metadata.
revoke all on table public.vetolayer_github_installations from anon, authenticated;

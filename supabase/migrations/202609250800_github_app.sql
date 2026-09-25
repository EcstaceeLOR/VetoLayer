-- Issue #56: production GitHub App installation and repository lifecycle.
-- No GitHub OAuth or installation access token is persisted in these tables.

create table if not exists public.vetolayer_github_installations (
  id text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  environment_id text not null references public.vetolayer_environments(id) on delete cascade,
  installation_id bigint not null,
  account_id bigint not null,
  account_login text not null,
  account_type text not null,
  repository_selection text not null check (repository_selection in ('all', 'selected')),
  permissions jsonb not null default '{}'::jsonb,
  state text not null check (state in ('ready', 'suspended', 'revoked', 'permission-error', 'disconnected')),
  installed_by_user_id text not null,
  last_sync_at timestamptz,
  last_event_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (workspace_id, project_id, environment_id)
);

create index if not exists vetolayer_github_installations_installation_idx
  on public.vetolayer_github_installations (installation_id);
create index if not exists vetolayer_github_installations_scope_idx
  on public.vetolayer_github_installations (workspace_id, project_id, environment_id);

create table if not exists public.vetolayer_github_repositories (
  connection_id text not null references public.vetolayer_github_installations(id) on delete cascade,
  repository_id bigint not null,
  owner_login text not null,
  name text not null,
  full_name text not null,
  is_private boolean not null default false,
  default_branch text not null default 'main',
  connected boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (connection_id, repository_id)
);

create index if not exists vetolayer_github_repositories_connected_idx
  on public.vetolayer_github_repositories (connection_id, connected, full_name);

create table if not exists public.vetolayer_github_install_states (
  state_hash text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  environment_id text not null references public.vetolayer_environments(id) on delete cascade,
  user_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists vetolayer_github_install_states_expiry_idx
  on public.vetolayer_github_install_states (expires_at);

create table if not exists public.vetolayer_github_webhook_deliveries (
  delivery_id text primary key,
  event text not null,
  installation_id bigint,
  received_at timestamptz not null default now()
);

create index if not exists vetolayer_github_webhook_deliveries_received_idx
  on public.vetolayer_github_webhook_deliveries (received_at desc);

-- VetoLayer Issue #54: durable workspace/project/environment/member model.
-- Run with the Supabase migration runner or SQL editor using an administrative role.

create table if not exists public.vetolayer_workspaces (
  id text primary key,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  legacy_workspace_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);
alter table public.vetolayer_workspaces enable row level security;

create table if not exists public.vetolayer_workspace_members (
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null check (role in ('owner', 'admin', 'reviewer', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists vetolayer_workspace_members_user_idx
  on public.vetolayer_workspace_members (user_id, workspace_id);
create unique index if not exists vetolayer_workspace_single_owner_idx
  on public.vetolayer_workspace_members (workspace_id)
  where role = 'owner';
alter table public.vetolayer_workspace_members enable row level security;

create table if not exists public.vetolayer_projects (
  id text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
create index if not exists vetolayer_projects_workspace_status_idx
  on public.vetolayer_projects (workspace_id, status, created_at);
alter table public.vetolayer_projects enable row level security;

create table if not exists public.vetolayer_environments (
  id text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  slug text not null,
  kind text not null check (kind in ('development', 'staging', 'production', 'custom')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);
create index if not exists vetolayer_environments_project_status_idx
  on public.vetolayer_environments (workspace_id, project_id, status, created_at);
alter table public.vetolayer_environments enable row level security;

create table if not exists public.vetolayer_workspace_invitations (
  id text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'reviewer', 'member')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists vetolayer_workspace_invitations_workspace_idx
  on public.vetolayer_workspace_invitations (workspace_id, status, created_at desc);
create index if not exists vetolayer_workspace_invitations_email_idx
  on public.vetolayer_workspace_invitations (lower(email), status);
alter table public.vetolayer_workspace_invitations enable row level security;

-- Scope existing product records. These remain nullable so historical pre-#54
-- records, the public demo, and server-owned service scopes stay readable.
alter table if exists public.vetolayer_decisions
  add column if not exists project_id text,
  add column if not exists environment_id text;
create index if not exists vetolayer_decisions_scope_created_idx
  on public.vetolayer_decisions (workspace_id, project_id, environment_id, created_at desc);

alter table if exists public.vetolayer_policies
  add column if not exists project_id text,
  add column if not exists environment_id text;
create index if not exists vetolayer_policies_scope_updated_idx
  on public.vetolayer_policies (workspace_id, project_id, environment_id, updated_at desc);

alter table if exists public.vetolayer_review_cases
  add column if not exists project_id text,
  add column if not exists environment_id text;
create index if not exists vetolayer_review_cases_scope_updated_idx
  on public.vetolayer_review_cases (workspace_id, project_id, environment_id, updated_at desc);

alter table if exists public.vetolayer_integration_configs
  add column if not exists project_id text,
  add column if not exists environment_id text;
create index if not exists vetolayer_integration_configs_scope_updated_idx
  on public.vetolayer_integration_configs (workspace_id, project_id, environment_id, updated_at desc);

-- One-time bridge for accounts that used the pre-#54 `user:<supabase-user-id>`
-- pseudo-workspace. Create the user's real workspace/project/environment first,
-- then call this function with those IDs. It re-namespaced primary keys as well
-- as setting scope columns so existing records remain addressable by the stores.
-- Historical receipt JSON is deliberately NOT rewritten: doing so would invalidate
-- its SHA-256 integrity hash. New receipts carry scope inside the signed content.
create or replace function public.vetolayer_migrate_legacy_workspace(
  legacy_id text,
  destination_workspace_id text,
  destination_project_id text,
  destination_environment_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.vetolayer_workspaces
    where id = destination_workspace_id and status = 'active'
  ) then
    raise exception 'destination workspace does not exist or is not active';
  end if;

  if not exists (
    select 1 from public.vetolayer_projects
    where id = destination_project_id
      and workspace_id = destination_workspace_id
  ) then
    raise exception 'destination project does not belong to workspace';
  end if;

  if not exists (
    select 1 from public.vetolayer_environments
    where id = destination_environment_id
      and workspace_id = destination_workspace_id
      and project_id = destination_project_id
  ) then
    raise exception 'destination environment does not belong to project';
  end if;

  update public.vetolayer_decisions
  set workspace_id = destination_workspace_id,
      project_id = destination_project_id,
      environment_id = destination_environment_id,
      id = destination_workspace_id || ':' || coalesce(receipt->>'receiptId', id)
  where workspace_id = legacy_id;

  update public.vetolayer_policies
  set workspace_id = destination_workspace_id,
      project_id = destination_project_id,
      environment_id = destination_environment_id,
      id = destination_workspace_id || ':' || destination_project_id || ':' || destination_environment_id || ':' || coalesce(policy->>'id', id)
  where workspace_id = legacy_id;

  update public.vetolayer_review_cases
  set workspace_id = destination_workspace_id,
      project_id = destination_project_id,
      environment_id = destination_environment_id,
      id = destination_workspace_id || ':' || coalesce(payload->>'id', id)
  where workspace_id = legacy_id;

  update public.vetolayer_integration_configs
  set workspace_id = destination_workspace_id,
      project_id = destination_project_id,
      environment_id = destination_environment_id,
      id = destination_workspace_id || ':' || destination_project_id || ':' || destination_environment_id || ':' || integration
  where workspace_id = legacy_id;

  update public.vetolayer_workspaces
  set legacy_workspace_id = legacy_id,
      updated_at = now()
  where id = destination_workspace_id;
end;
$$;

revoke all on function public.vetolayer_migrate_legacy_workspace(text, text, text, text) from public;

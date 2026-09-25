-- VetoLayer Issue #57: project/environment-scoped developer credentials, request history, and outbound webhooks.
-- These tables are server-owned. RLS is intentionally enabled without browser policies;
-- production access goes through the service-role-backed server stores.

create table if not exists public.vetolayer_api_keys (
  id text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  environment_id text not null references public.vetolayer_environments(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null,
  key_hash text not null unique,
  permissions jsonb not null default '["evaluate"]'::jsonb check (jsonb_typeof(permissions) = 'array'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  check (status = 'active' or revoked_at is not null)
);
create index if not exists vetolayer_api_keys_scope_idx
  on public.vetolayer_api_keys (workspace_id, project_id, environment_id, created_at desc);
create index if not exists vetolayer_api_keys_active_hash_idx
  on public.vetolayer_api_keys (key_hash) where status = 'active';
alter table public.vetolayer_api_keys enable row level security;

create table if not exists public.vetolayer_api_requests (
  id text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  environment_id text not null references public.vetolayer_environments(id) on delete cascade,
  request_id text not null unique,
  key_id text references public.vetolayer_api_keys(id) on delete set null,
  action_id text not null,
  outcome text not null check (outcome in ('ALLOW', 'REVIEW', 'BLOCK')),
  receipt_id text,
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default now()
);
create index if not exists vetolayer_api_requests_scope_created_idx
  on public.vetolayer_api_requests (workspace_id, project_id, environment_id, created_at desc);
create index if not exists vetolayer_api_requests_key_created_idx
  on public.vetolayer_api_requests (key_id, created_at desc);
alter table public.vetolayer_api_requests enable row level security;

create table if not exists public.vetolayer_webhook_endpoints (
  id text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  environment_id text not null references public.vetolayer_environments(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  url text not null check (char_length(url) between 8 and 2048),
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array'),
  secret_ciphertext text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_delivery_at timestamptz
);
create index if not exists vetolayer_webhook_endpoints_scope_idx
  on public.vetolayer_webhook_endpoints (workspace_id, project_id, environment_id, created_at desc);
alter table public.vetolayer_webhook_endpoints enable row level security;

create table if not exists public.vetolayer_webhook_deliveries (
  id text primary key,
  endpoint_id text not null references public.vetolayer_webhook_endpoints(id) on delete cascade,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  environment_id text not null references public.vetolayer_environments(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  status text not null check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  payload jsonb not null default '{}'::jsonb,
  status_code integer,
  error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists vetolayer_webhook_deliveries_scope_created_idx
  on public.vetolayer_webhook_deliveries (workspace_id, project_id, environment_id, created_at desc);
create index if not exists vetolayer_webhook_deliveries_endpoint_created_idx
  on public.vetolayer_webhook_deliveries (endpoint_id, created_at desc);
alter table public.vetolayer_webhook_deliveries enable row level security;

-- The service role is the only runtime principal expected to use these tables directly.
-- Explicit revokes guard against accidental future grants to browser roles.
revoke all on table public.vetolayer_api_keys from anon, authenticated;
revoke all on table public.vetolayer_api_requests from anon, authenticated;
revoke all on table public.vetolayer_webhook_endpoints from anon, authenticated;
revoke all on table public.vetolayer_webhook_deliveries from anon, authenticated;

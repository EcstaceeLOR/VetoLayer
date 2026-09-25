-- VetoLayer Developer Console persistence (Issue #57)
-- These tables are accessed only through server-side service-role requests.

create table if not exists public.vetolayer_api_keys (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  environment_id text not null,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  permissions jsonb not null default '[]'::jsonb,
  status text not null check (status in ('active', 'revoked')),
  created_by_user_id text not null,
  created_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists vetolayer_api_keys_scope_idx
  on public.vetolayer_api_keys (workspace_id, project_id, environment_id, created_at desc);

create table if not exists public.vetolayer_webhook_endpoints (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  environment_id text not null,
  name text not null,
  url text not null,
  events jsonb not null default '[]'::jsonb,
  secret_ciphertext text not null,
  status text not null check (status in ('active', 'revoked')),
  created_by_user_id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_delivery_at timestamptz
);

create index if not exists vetolayer_webhook_endpoints_scope_idx
  on public.vetolayer_webhook_endpoints (workspace_id, project_id, environment_id, created_at desc);

create table if not exists public.vetolayer_webhook_deliveries (
  id text primary key,
  endpoint_id text not null references public.vetolayer_webhook_endpoints(id),
  workspace_id text not null,
  project_id text not null,
  environment_id text not null,
  event_id text not null,
  event_type text not null,
  status text not null check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  status_code integer,
  error text,
  created_at timestamptz not null,
  delivered_at timestamptz
);

create index if not exists vetolayer_webhook_deliveries_scope_idx
  on public.vetolayer_webhook_deliveries (workspace_id, project_id, environment_id, created_at desc);

create table if not exists public.vetolayer_api_requests (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  environment_id text not null,
  request_id text not null unique,
  key_id text,
  action_id text not null,
  outcome text not null check (outcome in ('ALLOW', 'REVIEW', 'BLOCK')),
  receipt_id text,
  latency_ms integer not null default 0,
  created_at timestamptz not null
);

create index if not exists vetolayer_api_requests_scope_idx
  on public.vetolayer_api_requests (workspace_id, project_id, environment_id, created_at desc);

alter table public.vetolayer_api_keys enable row level security;
alter table public.vetolayer_webhook_endpoints enable row level security;
alter table public.vetolayer_webhook_deliveries enable row level security;
alter table public.vetolayer_api_requests enable row level security;

-- No anon/authenticated policies are intentionally created. The product server uses
-- SUPABASE_SERVICE_ROLE_KEY and enforces workspace/project/environment authorization
-- before reading or mutating these records.

-- Issue #61: durable product events, notification preferences, in-product alerts,
-- and asynchronous email/webhook delivery outbox.

create table if not exists public.vetolayer_product_events (
  id text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  environment_id text not null references public.vetolayer_environments(id) on delete cascade,
  idempotency_key text not null,
  event_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  message text not null,
  href text,
  actor_user_id uuid references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table if not exists public.vetolayer_notification_preferences (
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  in_app_events text[] not null default '{}'::text[],
  email_events text[] not null default '{}'::text[],
  project_ids text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.vetolayer_notifications (
  id text primary key,
  event_id text not null references public.vetolayer_product_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  environment_id text not null references public.vetolayer_environments(id) on delete cascade,
  event_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  message text not null,
  href text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (event_id, user_id)
);

create table if not exists public.vetolayer_notification_deliveries (
  id text primary key,
  event_id text not null references public.vetolayer_product_events(id) on delete cascade,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  environment_id text not null references public.vetolayer_environments(id) on delete cascade,
  channel text not null check (channel in ('email', 'webhook')),
  destination_key text not null,
  destination text not null,
  webhook_endpoint_id text references public.vetolayer_webhook_endpoints(id) on delete set null,
  status text not null check (status in ('pending', 'processing', 'delivered', 'failed', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, channel, destination_key)
);

create index if not exists vetolayer_product_events_scope_idx
  on public.vetolayer_product_events (workspace_id, project_id, environment_id, created_at desc);
create index if not exists vetolayer_notifications_user_idx
  on public.vetolayer_notifications (workspace_id, user_id, created_at desc);
create index if not exists vetolayer_notifications_unread_idx
  on public.vetolayer_notifications (workspace_id, user_id, created_at desc)
  where read_at is null;
create index if not exists vetolayer_notification_deliveries_due_idx
  on public.vetolayer_notification_deliveries (next_attempt_at, created_at)
  where status in ('pending', 'failed');
create index if not exists vetolayer_notification_deliveries_scope_idx
  on public.vetolayer_notification_deliveries (workspace_id, project_id, environment_id, created_at desc);
create index if not exists vetolayer_notification_deliveries_event_idx
  on public.vetolayer_notification_deliveries (event_id, channel, status);

alter table public.vetolayer_product_events enable row level security;
alter table public.vetolayer_notification_preferences enable row level security;
alter table public.vetolayer_notifications enable row level security;
alter table public.vetolayer_notification_deliveries enable row level security;

revoke all on table public.vetolayer_product_events from anon, authenticated;
revoke all on table public.vetolayer_notification_preferences from anon, authenticated;
revoke all on table public.vetolayer_notifications from anon, authenticated;
revoke all on table public.vetolayer_notification_deliveries from anon, authenticated;

create or replace function public.vetolayer_claim_notification_deliveries(p_limit integer default 25)
returns setof public.vetolayer_notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.vetolayer_notification_deliveries d
  set status = 'processing', updated_at = now()
  where d.id in (
    select candidate.id
    from public.vetolayer_notification_deliveries candidate
    where candidate.status in ('pending', 'failed')
      and candidate.next_attempt_at <= now()
    order by candidate.next_attempt_at asc, candidate.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  returning d.*;
end;
$$;

revoke all on function public.vetolayer_claim_notification_deliveries(integer) from public;
grant execute on function public.vetolayer_claim_notification_deliveries(integer) to service_role;

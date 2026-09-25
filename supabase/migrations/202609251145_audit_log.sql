-- Issue #62: first-class append-only activity/security audit log.
create table if not exists public.vetolayer_audit_events (
  id text primary key,
  workspace_id text not null,
  project_id text,
  environment_id text,
  actor_kind text not null check (actor_kind in ('human', 'service', 'system')),
  actor_user_id text,
  actor_label text,
  actor_role text,
  action text not null,
  category text not null check (category in ('security', 'workspace', 'member', 'project', 'environment', 'credential', 'integration', 'policy', 'review', 'webhook', 'settings')),
  target_type text not null,
  target_id text,
  target_label text,
  href text,
  request_id text,
  correlation_id text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vetolayer_audit_events_workspace_created_idx
  on public.vetolayer_audit_events (workspace_id, created_at desc, id desc);
create index if not exists vetolayer_audit_events_workspace_actor_idx
  on public.vetolayer_audit_events (workspace_id, actor_user_id, created_at desc);
create index if not exists vetolayer_audit_events_workspace_action_idx
  on public.vetolayer_audit_events (workspace_id, action, created_at desc);
create index if not exists vetolayer_audit_events_workspace_target_idx
  on public.vetolayer_audit_events (workspace_id, target_type, target_id, created_at desc);
create index if not exists vetolayer_audit_events_workspace_project_idx
  on public.vetolayer_audit_events (workspace_id, project_id, environment_id, created_at desc);

alter table public.vetolayer_audit_events enable row level security;
revoke all on public.vetolayer_audit_events from anon, authenticated;
grant select, insert on public.vetolayer_audit_events to service_role;

create or replace function public.vetolayer_reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'VetoLayer audit events are append-only';
end;
$$;

revoke all on function public.vetolayer_reject_audit_mutation() from public;
grant execute on function public.vetolayer_reject_audit_mutation() to service_role;

drop trigger if exists vetolayer_audit_events_append_only on public.vetolayer_audit_events;
create trigger vetolayer_audit_events_append_only
before update or delete on public.vetolayer_audit_events
for each row execute function public.vetolayer_reject_audit_mutation();

comment on table public.vetolayer_audit_events is
  'Append-only administrative and security activity. Never store raw credentials, tokens, passwords, cookies, authorization headers, or signing secrets in metadata.';

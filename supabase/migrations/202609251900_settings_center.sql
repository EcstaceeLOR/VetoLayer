-- Issue #64: consolidated, revisioned administrative settings and enforceable retention.

create table if not exists public.vetolayer_workspace_settings (
  workspace_id text primary key references public.vetolayer_workspaces(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  decision_retention_days integer not null default 365 check (decision_retention_days in (0, 30, 90, 180, 365, 730)),
  review_retention_days integer not null default 365 check (review_retention_days in (0, 30, 90, 180, 365, 730)),
  notification_retention_days integer not null default 90 check (notification_retention_days in (0, 30, 90, 180, 365, 730)),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references auth.users(id) on delete set null
);

alter table public.vetolayer_workspace_settings enable row level security;
revoke all on public.vetolayer_workspace_settings from anon, authenticated;
grant select, insert, update on public.vetolayer_workspace_settings to service_role;

comment on column public.vetolayer_workspace_settings.decision_retention_days is '0 means retain indefinitely.';
comment on column public.vetolayer_workspace_settings.review_retention_days is '0 means retain indefinitely.';
comment on column public.vetolayer_workspace_settings.notification_retention_days is '0 means retain indefinitely.';

create or replace function public.vetolayer_apply_workspace_retention(p_workspace_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.vetolayer_workspace_settings%rowtype;
  decision_count integer := 0;
  review_count integer := 0;
  event_count integer := 0;
  audit_id text;
begin
  select * into cfg
  from public.vetolayer_workspace_settings
  where workspace_id = p_workspace_id;

  if not found then
    return jsonb_build_object('workspaceId', p_workspace_id, 'configured', false, 'decisionsDeleted', 0, 'reviewsDeleted', 0, 'notificationEventsDeleted', 0);
  end if;

  if cfg.decision_retention_days > 0 then
    delete from public.vetolayer_decisions
    where workspace_id = p_workspace_id
      and created_at < now() - make_interval(days => cfg.decision_retention_days);
    get diagnostics decision_count = row_count;
  end if;

  if cfg.review_retention_days > 0 then
    delete from public.vetolayer_review_cases
    where workspace_id = p_workspace_id
      and created_at < now() - make_interval(days => cfg.review_retention_days);
    get diagnostics review_count = row_count;
  end if;

  if cfg.notification_retention_days > 0 then
    delete from public.vetolayer_product_events
    where workspace_id = p_workspace_id
      and created_at < now() - make_interval(days => cfg.notification_retention_days);
    get diagnostics event_count = row_count;
  end if;

  if decision_count + review_count + event_count > 0 then
    audit_id := 'audit_retention_' || md5(p_workspace_id || clock_timestamp()::text || random()::text);
    insert into public.vetolayer_audit_events (
      id, workspace_id, actor_kind, actor_label, action, category,
      target_type, target_id, target_label, href, metadata, created_at
    ) values (
      audit_id, p_workspace_id, 'system', 'VetoLayer retention worker', 'retention.apply', 'settings',
      'workspace', p_workspace_id, 'Workspace retention policy', '/dashboard/settings#data-retention',
      jsonb_build_object(
        'decisionRetentionDays', cfg.decision_retention_days,
        'reviewRetentionDays', cfg.review_retention_days,
        'notificationRetentionDays', cfg.notification_retention_days,
        'decisionsDeleted', decision_count,
        'reviewsDeleted', review_count,
        'notificationEventsDeleted', event_count
      ),
      now()
    );
  end if;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'configured', true,
    'decisionsDeleted', decision_count,
    'reviewsDeleted', review_count,
    'notificationEventsDeleted', event_count
  );
end;
$$;

revoke all on function public.vetolayer_apply_workspace_retention(text) from public;
grant execute on function public.vetolayer_apply_workspace_retention(text) to service_role;

create or replace function public.vetolayer_apply_all_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg record;
  result jsonb := '[]'::jsonb;
begin
  for cfg in select workspace_id from public.vetolayer_workspace_settings loop
    result := result || jsonb_build_array(public.vetolayer_apply_workspace_retention(cfg.workspace_id));
  end loop;
  return result;
end;
$$;

revoke all on function public.vetolayer_apply_all_retention() from public;
grant execute on function public.vetolayer_apply_all_retention() to service_role;

comment on table public.vetolayer_workspace_settings is
  'Revisioned workspace administration settings. Security audit events are intentionally excluded from retention and remain append-only.';

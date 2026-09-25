-- Issue #68: complete workspace/account data lifecycle with durable export/deletion jobs.

create table if not exists public.vetolayer_data_lifecycle_jobs (
  id text primary key,
  workspace_id text,
  requested_by_user_id text not null,
  kind text not null check (kind in ('workspace_export', 'workspace_delete', 'account_delete')),
  status text not null check (status in ('queued', 'scheduled', 'running', 'completed', 'failed', 'cancelled')),
  scheduled_for timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists vetolayer_data_lifecycle_workspace_idx
  on public.vetolayer_data_lifecycle_jobs (workspace_id, created_at desc);
create index if not exists vetolayer_data_lifecycle_user_idx
  on public.vetolayer_data_lifecycle_jobs (requested_by_user_id, created_at desc);
create index if not exists vetolayer_data_lifecycle_due_idx
  on public.vetolayer_data_lifecycle_jobs (scheduled_for, created_at)
  where status in ('queued', 'scheduled', 'failed');

alter table public.vetolayer_data_lifecycle_jobs enable row level security;
revoke all on public.vetolayer_data_lifecycle_jobs from anon, authenticated;
grant select, insert, update on public.vetolayer_data_lifecycle_jobs to service_role;

create or replace function public.vetolayer_safe_workspace_export(p_workspace_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_row jsonb;
begin
  select jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'slug', w.slug,
    'status', w.status,
    'createdAt', w.created_at,
    'updatedAt', w.updated_at
  ) into workspace_row
  from public.vetolayer_workspaces w
  where w.id = p_workspace_id;

  if workspace_row is null then
    raise exception 'workspace not found';
  end if;

  return jsonb_build_object(
    'workspace', workspace_row,
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'workspaceId', p.workspace_id, 'name', p.name, 'slug', p.slug,
        'status', p.status, 'createdAt', p.created_at, 'updatedAt', p.updated_at
      ) order by p.created_at, p.id)
      from public.vetolayer_projects p
      where p.workspace_id = p_workspace_id
    ), '[]'::jsonb),
    'environments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'workspaceId', e.workspace_id, 'projectId', e.project_id,
        'name', e.name, 'slug', e.slug, 'kind', e.kind, 'status', e.status,
        'createdAt', e.created_at, 'updatedAt', e.updated_at
      ) order by e.created_at, e.id)
      from public.vetolayer_environments e
      where e.workspace_id = p_workspace_id
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'workspaceId', m.workspace_id, 'userId', m.user_id, 'email', m.email,
        'displayName', m.display_name, 'role', m.role, 'joinedAt', m.joined_at
      ) order by m.joined_at, m.user_id)
      from public.vetolayer_workspace_members m
      where m.workspace_id = p_workspace_id
    ), '[]'::jsonb),
    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'projectId', p.project_id, 'policyId', p.policy_id, 'version', p.version,
        'state', p.state, 'policy', p.policy, 'targetEnvironmentIds', p.target_environment_ids,
        'sourceTemplateId', p.source_template_id, 'basedOnVersionId', p.based_on_version_id,
        'changeNote', p.change_note, 'createdByUserId', p.created_by_user_id,
        'createdAt', p.created_at, 'updatedAt', p.updated_at,
        'publishedAt', p.published_at, 'archivedAt', p.archived_at
      ) order by p.project_id, p.policy_id, p.version)
      from public.vetolayer_policy_versions p
      where p.workspace_id = p_workspace_id
    ), '[]'::jsonb),
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'receiptId', d.receipt_id,
        'decisionId', d.decision_id,
        'projectId', d.project_id,
        'environmentId', d.environment_id,
        'source', d.source,
        'reviewState', d.review_state,
        'reviewCaseId', d.review_case_id,
        'parentReceiptId', d.parent_receipt_id,
        'createdAt', d.created_at,
        'receipt', d.receipt
      ) order by d.created_at, d.id)
      from public.vetolayer_decisions d
      where d.workspace_id = p_workspace_id
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'projectId', r.project_id, 'environmentId', r.environment_id,
        'status', r.status, 'revision', r.revision, 'assigneeUserId', r.assignee_user_id,
        'dueAt', r.due_at, 'createdAt', r.created_at, 'updatedAt', r.updated_at,
        'payload', r.payload
      ) order by r.created_at, r.id)
      from public.vetolayer_review_cases r
      where r.workspace_id = p_workspace_id
    ), '[]'::jsonb),
    'auditEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'projectId', a.project_id, 'environmentId', a.environment_id,
        'actorKind', a.actor_kind, 'actorUserId', a.actor_user_id, 'actorLabel', a.actor_label,
        'actorRole', a.actor_role, 'action', a.action, 'category', a.category,
        'targetType', a.target_type, 'targetId', a.target_id, 'targetLabel', a.target_label,
        'href', a.href, 'requestId', a.request_id, 'correlationId', a.correlation_id,
        'ipAddress', a.ip_address, 'userAgent', a.user_agent, 'metadata', a.metadata,
        'createdAt', a.created_at
      ) order by a.created_at, a.id)
      from public.vetolayer_audit_events a
      where a.workspace_id = p_workspace_id
    ), '[]'::jsonb),
    'retention', (
      select jsonb_build_object(
        'revision', s.revision,
        'decisionRetentionDays', s.decision_retention_days,
        'reviewRetentionDays', s.review_retention_days,
        'notificationRetentionDays', s.notification_retention_days,
        'updatedAt', s.updated_at
      )
      from public.vetolayer_workspace_settings s
      where s.workspace_id = p_workspace_id
    ),
    'plan', (
      select jsonb_build_object(
        'planId', p.plan_id, 'source', p.source, 'assignedAt', p.assigned_at, 'updatedAt', p.updated_at
      )
      from public.vetolayer_workspace_plans p
      where p.workspace_id = p_workspace_id
    ),
    'inventory', jsonb_build_object(
      'projects', (select count(*) from public.vetolayer_projects where workspace_id = p_workspace_id),
      'environments', (select count(*) from public.vetolayer_environments where workspace_id = p_workspace_id),
      'members', (select count(*) from public.vetolayer_workspace_members where workspace_id = p_workspace_id),
      'policyVersions', (select count(*) from public.vetolayer_policy_versions where workspace_id = p_workspace_id),
      'decisions', (select count(*) from public.vetolayer_decisions where workspace_id = p_workspace_id),
      'reviews', (select count(*) from public.vetolayer_review_cases where workspace_id = p_workspace_id),
      'auditEvents', (select count(*) from public.vetolayer_audit_events where workspace_id = p_workspace_id)
    ),
    'excludedSecrets', jsonb_build_array(
      'API key hashes and raw keys',
      'webhook signing secrets/ciphertext',
      'GitHub installation credentials',
      'invitation token hashes',
      'authentication cookies, refresh tokens, passwords and service-role credentials'
    )
  );
end;
$$;

revoke all on function public.vetolayer_safe_workspace_export(text) from public;
grant execute on function public.vetolayer_safe_workspace_export(text) to service_role;

create or replace function public.vetolayer_transfer_workspace_ownership(
  p_workspace_id text,
  p_current_owner uuid,
  p_new_owner uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
  next_role text;
begin
  if p_current_owner = p_new_owner then
    raise exception 'new owner must be a different user';
  end if;

  select role into current_role
  from public.vetolayer_workspace_members
  where workspace_id = p_workspace_id and user_id = p_current_owner
  for update;

  select role into next_role
  from public.vetolayer_workspace_members
  where workspace_id = p_workspace_id and user_id = p_new_owner
  for update;

  if current_role is distinct from 'owner' then
    raise exception 'requesting user is not the workspace owner';
  end if;
  if next_role is null then
    raise exception 'new owner is not an active workspace member';
  end if;

  update public.vetolayer_workspace_members
  set role = 'admin'
  where workspace_id = p_workspace_id and user_id = p_current_owner;

  update public.vetolayer_workspace_members
  set role = 'owner'
  where workspace_id = p_workspace_id and user_id = p_new_owner;
end;
$$;

revoke all on function public.vetolayer_transfer_workspace_ownership(text, uuid, uuid) from public;
grant execute on function public.vetolayer_transfer_workspace_ownership(text, uuid, uuid) to service_role;

create or replace function public.vetolayer_permanently_delete_workspace(
  p_workspace_id text,
  p_owner_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  retained_audit integer := 0;
  deleted_decisions integer := 0;
  deleted_legacy_policies integer := 0;
  deleted_legacy_integrations integer := 0;
begin
  if not exists (
    select 1 from public.vetolayer_workspace_members
    where workspace_id = p_workspace_id and user_id = p_owner_user_id and role = 'owner'
  ) then
    raise exception 'workspace deletion requires the current owner';
  end if;

  select count(*) into retained_audit
  from public.vetolayer_audit_events
  where workspace_id = p_workspace_id;

  delete from public.vetolayer_decisions where workspace_id = p_workspace_id;
  get diagnostics deleted_decisions = row_count;

  delete from public.vetolayer_policies where workspace_id = p_workspace_id;
  get diagnostics deleted_legacy_policies = row_count;

  delete from public.vetolayer_integration_configs where workspace_id = p_workspace_id;
  get diagnostics deleted_legacy_integrations = row_count;

  delete from public.vetolayer_workspaces where id = p_workspace_id;
  if not found then raise exception 'workspace not found'; end if;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'deleted', true,
    'deletedDecisions', deleted_decisions,
    'deletedLegacyPolicies', deleted_legacy_policies,
    'deletedLegacyIntegrations', deleted_legacy_integrations,
    'retainedAppendOnlyAuditEvents', retained_audit
  );
end;
$$;

revoke all on function public.vetolayer_permanently_delete_workspace(text, uuid) from public;
grant execute on function public.vetolayer_permanently_delete_workspace(text, uuid) to service_role;

create or replace function public.vetolayer_offboard_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_count integer := 0;
  notification_count integer := 0;
  preference_count integer := 0;
  invitation_count integer := 0;
begin
  if exists (
    select 1 from public.vetolayer_workspace_members
    where user_id = p_user_id and role = 'owner'
  ) then
    raise exception 'account still owns one or more workspaces';
  end if;

  delete from public.vetolayer_notifications where user_id = p_user_id;
  get diagnostics notification_count = row_count;

  delete from public.vetolayer_notification_preferences where user_id = p_user_id;
  get diagnostics preference_count = row_count;

  delete from public.vetolayer_workspace_invitations where invited_by_user_id = p_user_id;
  get diagnostics invitation_count = row_count;

  delete from public.vetolayer_workspace_members where user_id = p_user_id;
  get diagnostics membership_count = row_count;

  delete from public.vetolayer_onboarding_state where user_id = p_user_id;

  return jsonb_build_object(
    'userId', p_user_id,
    'liveMembershipsRemoved', membership_count,
    'notificationsRemoved', notification_count,
    'notificationPreferencesRemoved', preference_count,
    'invitationsRemoved', invitation_count,
    'historicalReceiptsAndAuditRetained', true
  );
end;
$$;

revoke all on function public.vetolayer_offboard_account(uuid) from public;
grant execute on function public.vetolayer_offboard_account(uuid) to service_role;

comment on table public.vetolayer_data_lifecycle_jobs is
  'Durable export/deletion work. Jobs survive workspace removal so destructive operations remain observable and retryable.';

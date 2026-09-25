-- VetoLayer Issue #58: immutable Policy Studio lifecycle/version history.
-- Published policy content never mutates in place. Draft editing is isolated to
-- draft rows, and activation atomically archives the prior active version.

create table if not exists public.vetolayer_policy_versions (
  id text primary key,
  workspace_id text not null references public.vetolayer_workspaces(id) on delete cascade,
  project_id text not null references public.vetolayer_projects(id) on delete cascade,
  policy_id text not null,
  version integer not null check (version > 0),
  state text not null check (state in ('draft', 'active', 'archived')),
  policy jsonb not null,
  target_environment_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(target_environment_ids) = 'array' and jsonb_array_length(target_environment_ids) > 0),
  source_template_id text,
  based_on_version_id text references public.vetolayer_policy_versions(id) on delete set null,
  change_note text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  unique (workspace_id, project_id, policy_id, version)
);

create index if not exists vetolayer_policy_versions_project_idx
  on public.vetolayer_policy_versions (workspace_id, project_id, policy_id, version desc);
create index if not exists vetolayer_policy_versions_active_idx
  on public.vetolayer_policy_versions (workspace_id, project_id, state, updated_at desc);
create unique index if not exists vetolayer_policy_versions_one_active_idx
  on public.vetolayer_policy_versions (workspace_id, project_id, policy_id)
  where state = 'active';
create unique index if not exists vetolayer_policy_versions_one_draft_idx
  on public.vetolayer_policy_versions (workspace_id, project_id, policy_id)
  where state = 'draft';

alter table public.vetolayer_policy_versions enable row level security;
revoke all on table public.vetolayer_policy_versions from anon, authenticated;
grant select, insert, update, delete on table public.vetolayer_policy_versions to service_role;

-- Existing scoped policies become immutable v1 records. Rows that predate the
-- real project/environment model remain in the legacy table instead of being
-- promoted to an ambiguous production scope.
insert into public.vetolayer_policy_versions (
  id, workspace_id, project_id, policy_id, version, state, policy,
  target_environment_ids, change_note, created_by_user_id,
  created_at, updated_at, published_at, archived_at
)
select
  'pv_legacy_' || md5(p.id),
  p.workspace_id,
  p.project_id,
  'policy_legacy_' || md5(p.id),
  1,
  case when coalesce((p.policy->>'enabled')::boolean, true) then 'active' else 'archived' end,
  jsonb_set(p.policy, '{enabled}', case when coalesce((p.policy->>'enabled')::boolean, true) then 'true'::jsonb else 'false'::jsonb end, true),
  jsonb_build_array(p.environment_id),
  'Imported from the pre-versioning Policy Studio',
  m.user_id,
  p.updated_at,
  p.updated_at,
  case when coalesce((p.policy->>'enabled')::boolean, true) then p.updated_at else null end,
  case when coalesce((p.policy->>'enabled')::boolean, true) then null else p.updated_at end
from public.vetolayer_policies p
join lateral (
  select user_id
  from public.vetolayer_workspace_members wm
  where wm.workspace_id = p.workspace_id
  order by case wm.role when 'owner' then 0 when 'admin' then 1 else 2 end, wm.joined_at
  limit 1
) m on true
where p.project_id is not null
  and p.environment_id is not null
  and not exists (
    select 1 from public.vetolayer_policy_versions existing
    where existing.id = 'pv_legacy_' || md5(p.id)
  );

-- Forking a published version is the only supported way to edit it. The source
-- row is locked, then a monotonically increasing draft version is created.
create or replace function public.vetolayer_fork_policy_version(
  p_source_version_id text,
  p_new_version_id text,
  p_created_by_user_id uuid,
  p_change_note text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row public.vetolayer_policy_versions%rowtype;
  next_version integer;
begin
  select * into source_row
  from public.vetolayer_policy_versions
  where id = p_source_version_id
  for update;

  if source_row.id is null then
    raise exception 'policy version not found';
  end if;

  if exists (
    select 1 from public.vetolayer_policy_versions
    where workspace_id = source_row.workspace_id
      and project_id = source_row.project_id
      and policy_id = source_row.policy_id
      and state = 'draft'
  ) then
    raise exception 'policy already has an editable draft';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.vetolayer_policy_versions
  where workspace_id = source_row.workspace_id
    and project_id = source_row.project_id
    and policy_id = source_row.policy_id;

  insert into public.vetolayer_policy_versions (
    id, workspace_id, project_id, policy_id, version, state, policy,
    target_environment_ids, source_template_id, based_on_version_id,
    change_note, created_by_user_id, created_at, updated_at
  ) values (
    p_new_version_id,
    source_row.workspace_id,
    source_row.project_id,
    source_row.policy_id,
    next_version,
    'draft',
    jsonb_set(source_row.policy, '{enabled}', 'false'::jsonb, true),
    source_row.target_environment_ids,
    source_row.source_template_id,
    source_row.id,
    p_change_note,
    p_created_by_user_id,
    now(),
    now()
  );

  return p_new_version_id;
end;
$$;

-- Activation is atomic: at most one version can be active for a logical policy,
-- and the previously active row is archived before the candidate is published.
create or replace function public.vetolayer_activate_policy_version(
  p_version_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.vetolayer_policy_versions%rowtype;
begin
  select * into candidate
  from public.vetolayer_policy_versions
  where id = p_version_id
  for update;

  if candidate.id is null then
    raise exception 'policy version not found';
  end if;

  if candidate.state = 'active' then
    return candidate.id;
  end if;

  update public.vetolayer_policy_versions
  set state = 'archived',
      policy = jsonb_set(policy, '{enabled}', 'false'::jsonb, true),
      archived_at = now(),
      updated_at = now()
  where workspace_id = candidate.workspace_id
    and project_id = candidate.project_id
    and policy_id = candidate.policy_id
    and state = 'active';

  update public.vetolayer_policy_versions
  set state = 'active',
      policy = jsonb_set(policy, '{enabled}', 'true'::jsonb, true),
      published_at = coalesce(published_at, now()),
      archived_at = null,
      updated_at = now()
  where id = candidate.id;

  return candidate.id;
end;
$$;

revoke all on function public.vetolayer_fork_policy_version(text, text, uuid, text) from public;
revoke all on function public.vetolayer_activate_policy_version(text) from public;
grant execute on function public.vetolayer_fork_policy_version(text, text, uuid, text) to service_role;
grant execute on function public.vetolayer_activate_policy_version(text) to service_role;

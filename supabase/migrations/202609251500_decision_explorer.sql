-- Issue #60: scalable Decision Explorer and Receipt Center indexes.
-- Signed receipt JSON remains immutable; these columns are derived search/index
-- metadata only and can always be rebuilt from the receipt payload.

create extension if not exists pg_trgm;

alter table public.vetolayer_decisions
  add column if not exists receipt_id text,
  add column if not exists decision_id text,
  add column if not exists request_id text,
  add column if not exists action_operation text,
  add column if not exists action_tool text,
  add column if not exists actor_id text,
  add column if not exists actor_name text,
  add column if not exists target_id text,
  add column if not exists outcome text,
  add column if not exists uses_serv boolean not null default false,
  add column if not exists policy_refs text[] not null default '{}'::text[],
  add column if not exists policy_keys text[] not null default '{}'::text[],
  add column if not exists search_text text not null default '',
  add column if not exists review_state text not null default 'none',
  add column if not exists review_case_id text,
  add column if not exists parent_receipt_id text;

alter table public.vetolayer_decisions
  drop constraint if exists vetolayer_decisions_outcome_check;
alter table public.vetolayer_decisions
  add constraint vetolayer_decisions_outcome_check
  check (outcome is null or outcome in ('ALLOW', 'REVIEW', 'BLOCK'));

alter table public.vetolayer_decisions
  drop constraint if exists vetolayer_decisions_review_state_check;
alter table public.vetolayer_decisions
  add constraint vetolayer_decisions_review_state_check
  check (review_state in ('none', 'pending', 'awaiting_evidence', 'resolved'));

update public.vetolayer_decisions d
set receipt_id = coalesce(d.receipt->>'receiptId', d.receipt_id),
    decision_id = coalesce(d.receipt->>'decisionId', d.decision_id),
    request_id = coalesce(d.receipt #>> '{action,requestId}', d.request_id),
    action_operation = coalesce(d.receipt #>> '{action,operation}', d.action_operation),
    action_tool = coalesce(d.receipt #>> '{action,tool}', d.action_tool),
    actor_id = coalesce(d.receipt #>> '{actor,id}', d.actor_id),
    actor_name = coalesce(d.receipt #>> '{actor,name}', d.actor_name),
    target_id = coalesce(d.receipt #>> '{action,targetId}', d.receipt #>> '{action,targetType}', d.target_id),
    outcome = coalesce(d.receipt->>'outcome', d.outcome),
    uses_serv = (jsonb_array_length(coalesce(d.receipt->'contextualFindings', '[]'::jsonb)) > 0) or d.receipt ? 'providerTrace',
    policy_refs = coalesce((select array_agg(distinct p->>'id') filter (where p->>'id' is not null) from jsonb_array_elements(coalesce(d.receipt->'policiesEvaluated', '[]'::jsonb)) p), '{}'::text[]),
    policy_keys = coalesce((select array_agg(distinct regexp_replace(p->>'id', '@v[0-9]+$', '', 'i')) filter (where p->>'id' is not null) from jsonb_array_elements(coalesce(d.receipt->'policiesEvaluated', '[]'::jsonb)) p), '{}'::text[]),
    search_text = lower(concat_ws(' ',
      d.receipt->>'receiptId',
      d.receipt->>'decisionId',
      d.receipt #>> '{action,requestId}',
      d.receipt #>> '{action,type}',
      d.receipt #>> '{action,tool}',
      d.receipt #>> '{action,operation}',
      d.receipt #>> '{action,targetType}',
      d.receipt #>> '{action,targetId}',
      d.receipt #>> '{action,environment}',
      d.receipt #>> '{actor,id}',
      d.receipt #>> '{actor,name}',
      d.receipt #>> '{actor,framework}',
      d.receipt->>'decisionSummary',
      coalesce((select string_agg(concat_ws(' ', p->>'id', p->>'name'), ' ') from jsonb_array_elements(coalesce(d.receipt->'policiesEvaluated', '[]'::jsonb)) p), '')
    ));

-- Backfill the review state/index for existing operational review cases. The
-- initial and latest resolution receipts are indexed directly; lineage lookups
-- remain anchored by signed action.requestId.
update public.vetolayer_decisions d
set review_state = rc.status,
    review_case_id = rc.payload->>'id'
from public.vetolayer_review_cases rc
where rc.workspace_id = d.workspace_id
  and (
    d.receipt_id = rc.payload #>> '{receipt,receiptId}'
    or d.receipt_id = rc.payload #>> '{resolutionReceipt,receiptId}'
  );

create unique index if not exists vetolayer_decisions_workspace_receipt_idx
  on public.vetolayer_decisions (workspace_id, receipt_id)
  where receipt_id is not null;
create index if not exists vetolayer_decisions_workspace_decision_idx
  on public.vetolayer_decisions (workspace_id, decision_id)
  where decision_id is not null;
create index if not exists vetolayer_decisions_lineage_idx
  on public.vetolayer_decisions (workspace_id, request_id, created_at asc)
  where request_id is not null;
create index if not exists vetolayer_decisions_explorer_idx
  on public.vetolayer_decisions (workspace_id, project_id, environment_id, outcome, created_at desc);
create index if not exists vetolayer_decisions_source_idx
  on public.vetolayer_decisions (workspace_id, source, created_at desc);
create index if not exists vetolayer_decisions_serv_idx
  on public.vetolayer_decisions (workspace_id, uses_serv, created_at desc);
create index if not exists vetolayer_decisions_review_idx
  on public.vetolayer_decisions (workspace_id, review_state, created_at desc);
create index if not exists vetolayer_decisions_policy_keys_idx
  on public.vetolayer_decisions using gin (policy_keys);
create index if not exists vetolayer_decisions_search_trgm_idx
  on public.vetolayer_decisions using gin (search_text gin_trgm_ops);

alter table public.vetolayer_decisions enable row level security;
revoke all on table public.vetolayer_decisions from anon, authenticated;

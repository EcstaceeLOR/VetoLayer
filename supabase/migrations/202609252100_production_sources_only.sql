alter table if exists public.vetolayer_decisions
  drop constraint if exists vetolayer_decisions_source_check;

alter table if exists public.vetolayer_decisions
  add constraint vetolayer_decisions_source_check
  check (source in ('api', 'integration'));

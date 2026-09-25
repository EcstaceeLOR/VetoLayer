-- VetoLayer Issue #55: durable onboarding resume state.
-- Completion is never trusted from this row; the application revalidates real
-- workspace/project/environment, integration, policy, SERV, and receipt state.

create table if not exists public.vetolayer_onboarding_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists vetolayer_onboarding_states_updated_idx
  on public.vetolayer_onboarding_states (updated_at desc);

alter table public.vetolayer_onboarding_states enable row level security;

-- Current VetoLayer server stores use the service-role key after authenticating
-- the user and validating workspace scope. No browser/public policy is created.

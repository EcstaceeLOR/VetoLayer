# Authentication and workspace ownership

VetoLayer's public MVP uses Supabase Auth through `@supabase/ssr`. The public marketing site and flagship demo remain accessible without an account; product routes under `/dashboard` and `/onboarding` require an authenticated session.

## Auth environment

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
NEXT_PUBLIC_APP_URL=https://<your-vetolayer-host>
```

The publishable key is browser-safe. `SUPABASE_SERVICE_ROLE_KEY` is separate and remains server-only.

Enable email/password authentication in Supabase Auth. Add the deployed VetoLayer origin and `/auth/callback` URL to the project's allowed redirect URLs.

VetoLayer prefers the configured `NEXT_PUBLIC_APP_URL` for confirmation redirects, then trusted Vercel deployment metadata, and only then the current request origin. Post-auth continuation paths are validated as same-origin application paths, including backslash/protocol-relative edge cases.

## Ownership model

The server verifies the current Supabase user and derives a workspace ID as:

```text
user:<supabase-user-id>
```

Clients cannot choose their hosted workspace ID. Internal APIs ignore caller-supplied workspace headers and resolve ownership from the authenticated user.

The deliberately public hackathon demo keeps its own configured workspace (`VETOLAYER_DEMO_WORKSPACE_ID`) and is not mixed with authenticated product workspaces.

The Developer API is also isolated from the demo workspace. Its bearer key maps to the server-owned `VETOLAYER_API_WORKSPACE_ID` (default `service:developer-api`). In production, the API is disabled with `503 API_AUTH_NOT_CONFIGURED` until `VETOLAYER_API_KEY` is configured.

## Durable tables

Server-side stores use the Supabase service-role key only after the application has established the workspace boundary. RLS stays enabled and no browser policies are required for the MVP because application data is not queried directly from the browser.

```sql
create table if not exists public.vetolayer_decisions (
  id text primary key,
  workspace_id text not null,
  source text not null check (source in ('demo', 'api', 'integration')),
  receipt jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists vetolayer_decisions_workspace_created_idx
  on public.vetolayer_decisions (workspace_id, created_at desc);
alter table public.vetolayer_decisions enable row level security;

create table if not exists public.vetolayer_policies (
  id text primary key,
  workspace_id text not null,
  policy jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists vetolayer_policies_workspace_updated_idx
  on public.vetolayer_policies (workspace_id, updated_at desc);
alter table public.vetolayer_policies enable row level security;

create table if not exists public.vetolayer_review_cases (
  id text primary key,
  workspace_id text not null,
  status text not null check (status in ('pending', 'resolved')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vetolayer_review_cases_workspace_updated_idx
  on public.vetolayer_review_cases (workspace_id, updated_at desc);
alter table public.vetolayer_review_cases enable row level security;

create table if not exists public.vetolayer_integration_configs (
  id text primary key,
  workspace_id text not null,
  integration text not null check (integration in ('github', 'developer-api')),
  state text not null check (state in ('ready', 'warning', 'needs-config')),
  account text,
  last_code text,
  updated_at timestamptz not null default now()
);
create index if not exists vetolayer_integration_configs_workspace_updated_idx
  on public.vetolayer_integration_configs (workspace_id, updated_at desc);
alter table public.vetolayer_integration_configs enable row level security;
```

Database row IDs are also namespaced by workspace before upsert, preventing two users with the same logical decision/review/policy identifier from overwriting one another.

## Route boundaries

Public:

- `/`
- `/demo`
- `/login`
- `/auth/callback`
- `/api/demo/*`
- `/api/health`
- `/api/v1/*` — separate bearer-key boundary; fail-closed in production if unconfigured

Authenticated product surface:

- `/dashboard/*`
- `/onboarding`
- `/api/decisions`
- `/api/policies`
- `/api/policies/simulate`
- `/api/reviews/*`
- `/api/integrations/status`

The Next.js 16 proxy refreshes Supabase sessions and redirects unauthenticated product-page requests to `/login`. Protected route handlers independently verify the current user and return `401` rather than trusting the browser.

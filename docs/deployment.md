# Public MVP deployment

VetoLayer's web app is designed for a normal Node.js-capable Next.js host. No local filesystem persistence, background worker, Kubernetes cluster, or custom gateway is required.

## 1. Required SERV configuration

Set these server-side environment variables in the hosting provider:

```text
SERV_API_KEY=...
SERV_MODEL=...
SERV_BASE_URL=https://inference-api.openserv.ai/v1
SERV_TIMEOUT_MS=20000
```

`SERV_API_KEY` and other server credentials must never use a `NEXT_PUBLIC_` prefix.

When SERV is unavailable or returns invalid reasoning, the VetoLayer orchestration path falls back to `REVIEW`; it does not silently approve the action.

## 2. Durable decision history

Hosted persistence uses Supabase's REST interface and requires no browser-side database credentials.

Create the MVP table:

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
```

The public MVP accesses this table only from server code using the Supabase service-role key. No client RLS policy is required for the demo workspace.

Configure:

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
VETOLAYER_DEMO_WORKSPACE_ID=demo
```

If the Supabase values are omitted locally, the product still runs but reports persistence as disabled and does not claim that history is durable.

## 3. Public demo controls

```text
VETOLAYER_DEMO_RATE_LIMIT_PER_MINUTE=30
```

The public demo API validates its input and applies a lightweight per-client rate limit. This is intended to protect a hackathon/public MVP, not replace an enterprise API gateway.

`DELETE /api/demo/reset` removes only rows with `source = demo` in the configured demo workspace.

## 4. Operational endpoints

- `GET /api/health` — reports service, SERV configuration state, and persistence configuration state without returning secret values.
- `GET /api/decisions?limit=50` — returns persisted receipt history when persistence is configured.
- `POST /api/demo/evaluate` — executes the flagship VetoLayer pipeline.
- `DELETE /api/demo/reset` — clears seeded/demo decision history only.

## 5. Build and run

From the repository root:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @vetolayer/web start
```

The same commands run in CI before issue branches are merged.

For a managed Next.js deployment, configure the repository as a pnpm monorepo and deploy `apps/web`, preserving access to the workspace packages under `packages/*` and `examples/github-gate`.

## Failure behavior

- malformed API input -> clear 4xx response
- rate limit exceeded -> `429` with `Retry-After`
- invalid server configuration -> `500` / degraded health status
- decision-history outage -> `503` for history, but it does not rewrite a VetoLayer decision
- receipt write failure -> evaluation remains available and a redacted warning is logged
- SERV/network/response failure -> VetoLayer returns `REVIEW`, never accidental `ALLOW`

## Secret handling

Server logging recursively redacts metadata keys that look like tokens, passwords, authorization values, secrets, or API keys. Decision Receipts do not contain SERV or GitHub credentials.

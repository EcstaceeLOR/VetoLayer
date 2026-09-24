# Public MVP deployment

VetoLayer is a pnpm monorepo with one deployable Next.js application at `apps/web`. It does not require Kubernetes, a background worker, local filesystem persistence, or a custom gateway.

The repository now includes `vercel.json`, so importing the **repository root** into Vercel is deterministic:

```text
Framework:         Next.js
Root Directory:    repository root / blank
Install Command:   pnpm install --no-frozen-lockfile
Build Command:     pnpm --filter @vetolayer/web build
Output Directory:  apps/web/.next
```

Do not set the Vercel Root Directory to `apps/web` unless you also deliberately reconfigure workspace installation; the web app depends on workspace packages under `packages/*` and `examples/github-gate`.

## 1. SERV configuration — required for the hackathon demo

Set these as **server-side** Vercel environment variables:

```text
SERV_API_KEY=...
SERV_MODEL=...
SERV_BASE_URL=https://inference-api.openserv.ai/v1
SERV_TIMEOUT_MS=20000
```

`SERV_BASE_URL` and `SERV_TIMEOUT_MS` have safe defaults, but setting them explicitly makes the release configuration auditable.

If SERV is unavailable, malformed, or unconfigured, VetoLayer fails safely to `REVIEW`; it never silently approves the action. However, the public hackathon demo is considered release-ready only when `GET /api/health` reports `demoReady: true`.

## 2. Supabase Auth — required for authenticated product surfaces

The public landing page and `/demo` do not require an account. `/dashboard` and `/onboarding` use Supabase Auth.

Configure:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
NEXT_PUBLIC_APP_URL=https://<your-production-domain>
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is intentionally browser-safe. Never use a service-role key in a `NEXT_PUBLIC_*` variable.

For the very first Vercel deployment, `NEXT_PUBLIC_APP_URL` may be omitted: VetoLayer can derive an origin from Vercel system metadata. Once the stable production URL is known, set `NEXT_PUBLIC_APP_URL` to that exact HTTPS origin and redeploy.

In Supabase Auth, enable email/password authentication and add:

```text
https://<your-production-domain>/auth/callback
```

to the allowed redirect URLs. See [`auth-workspaces.md`](auth-workspaces.md).

## 3. Durable product persistence — recommended

VetoLayer can run without durable persistence, but decision history, policies, review cases, and integration state should use Supabase for the public product.

Configure these **server-only** values together:

```text
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

If one is set without the other, VetoLayer intentionally treats the server configuration as invalid rather than starting in a partially configured state.

Create the four MVP tables from [`auth-workspaces.md`](auth-workspaces.md):

- `vetolayer_decisions`
- `vetolayer_policies`
- `vetolayer_review_cases`
- `vetolayer_integration_configs`

RLS remains enabled. Application data is accessed only from server code using the service-role key after VetoLayer has established the workspace boundary.

## 4. GitHub Gate — optional for the flagship seeded demo, required for live GitHub evidence

```text
GITHUB_TOKEN=...
```

The public `/demo` uses clearly labelled seeded GitHub evidence so judges can run it reliably. `GITHUB_TOKEN` is required when using the Integrations connection test or collecting live PR evidence through the GitHub Gate.

## 5. Developer API — fail closed in production

A public production deployment does **not** expose an unauthenticated evaluation API. Configure:

```text
VETOLAYER_API_KEY=<long-random-server-secret>
VETOLAYER_API_WORKSPACE_ID=service:developer-api
VETOLAYER_API_RATE_LIMIT_PER_MINUTE=60
```

When `NODE_ENV=production` and `VETOLAYER_API_KEY` is absent, `/api/v1/*` returns `503 API_AUTH_NOT_CONFIGURED`. With a key configured, clients must send `Authorization: Bearer <key>`.

The API workspace is server-owned; clients cannot select another tenant through a request header.

## 6. Public demo controls

```text
VETOLAYER_DEMO_WORKSPACE_ID=demo
VETOLAYER_DEMO_RATE_LIMIT_PER_MINUTE=30
```

The public flagship flow is intentionally self-contained:

1. `/api/demo/evaluate` evaluates the action with missing approval.
2. `/api/demo/review` adds the clearly labelled seeded security-lead human-review evidence and re-runs the full deterministic + SERV pipeline.
3. `/api/demo/reset` clears demo decision/review history when persistence is configured and resets in-memory review state where applicable.

Clients cannot ask `/api/demo/evaluate` to jump directly to the resolved state.

## 7. Operational endpoint

`GET /api/health` returns secret-free deployment state:

- service status
- `demoReady`
- SERV readiness
- authentication readiness
- persistence readiness
- GitHub readiness
- Developer API readiness

It never returns credential values.

## 8. Local build and release verification

From the repository root:

```bash
corepack enable
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm release:smoke
```

Then run:

```bash
pnpm dev
```

The local site is available at `http://localhost:3000`.

After deploying, run the live probe from a local checkout:

```bash
SMOKE_BASE_URL=https://<your-production-domain> pnpm release:smoke
```

The live smoke probe checks public pages, authentication redirects, `/api/health`, and requires `demoReady: true` so a deployment without working SERV credentials cannot be mistaken for submission-ready.

## Failure behavior

- malformed API input -> clear `4xx` response
- missing production Developer API key -> `503`, API disabled
- wrong Developer API bearer token -> `401`
- rate limit exceeded -> `429` with `Retry-After`
- invalid paired server configuration -> degraded / `5xx`
- decision-history outage -> does not rewrite a VetoLayer decision
- receipt write failure -> evaluation remains available and a redacted warning is logged
- SERV/network/response failure -> VetoLayer returns `REVIEW`, never accidental `ALLOW`

## Secret handling

Server logging recursively redacts metadata keys that look like tokens, passwords, authorization values, secrets, or API keys. Decision Receipts do not contain SERV, GitHub, VetoLayer API, or Supabase service-role credentials.

The release smoke script scans generated browser bundles for the actual values of known server secrets whenever those values are present in the release environment.

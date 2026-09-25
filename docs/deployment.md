# Production deployment

VetoLayer is a pnpm monorepo with one deployable Next.js application at `apps/web`. The public production deployment is currently hosted on Vercel.

## Vercel project settings

Use the web application as the Vercel project root:

```text
Framework:         Next.js
Root Directory:    apps/web
Install Command:   pnpm install --frozen-lockfile
Build Command:     pnpm build
Output Directory:  .next
```

Enable Vercel's option to include source files outside the Root Directory: `apps/web` imports workspace packages under `packages/*` and `examples/github-gate`.

Do not configure the Output Directory as `apps/web/.next` when Root Directory is already `apps/web`; that resolves to the invalid nested path `apps/web/apps/web/.next`.

## 1. SERV Reasoning

Required for real contextual judgment:

```text
SERV_API_KEY=...
SERV_MODEL=...
SERV_BASE_URL=https://inference-api.openserv.ai/v1
SERV_TIMEOUT_MS=20000
```

If SERV is unavailable, malformed, or unconfigured, VetoLayer fails safely to `REVIEW`; it never silently approves the action.

## 2. Supabase Auth

Required for account and authenticated product surfaces:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
NEXT_PUBLIC_APP_URL=https://<your-production-domain>
```

Enable email/password authentication and allow the production callback URL:

```text
https://<your-production-domain>/auth/callback
```

See [`production-auth.md`](production-auth.md) and [`auth-workspaces.md`](auth-workspaces.md).

## 3. Durable product persistence

Durable persistence is **required for production workspace creation and management**. Configure both server-only values:

```text
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Run:

```text
supabase/migrations/202609250100_workspace_model.sql
```

The production model includes:

- `vetolayer_workspaces`
- `vetolayer_workspace_members`
- `vetolayer_projects`
- `vetolayer_environments`
- `vetolayer_workspace_invitations`
- `vetolayer_decisions`
- `vetolayer_policies`
- `vetolayer_review_cases`
- `vetolayer_integration_configs`

The migration also adds project/environment scope indexes to the existing operational tables and provides a one-time bridge for historical `user:<id>` workspaces. See [`auth-workspaces.md`](auth-workspaces.md).

The service-role key never enters browser code. Application routes authenticate the Supabase user, validate workspace membership, role, project ownership, and environment ownership, then perform server-side persistence.

## 4. GitHub Gate

Optional for the seeded public example, required for live GitHub evidence:

```text
GITHUB_TOKEN=...
```

The token stays server-only.

## 5. Developer API

Production fails closed when the Developer API bearer secret is absent:

```text
VETOLAYER_API_KEY=<long-random-server-secret>
VETOLAYER_API_WORKSPACE_ID=service:developer-api
VETOLAYER_API_PROJECT_ID=service:default-project
VETOLAYER_API_ENVIRONMENT_ID=service:production
VETOLAYER_API_RATE_LIMIT_PER_MINUTE=60
```

Until the Developer Console creates first-class API keys, this single key is bound server-side to the explicit service workspace/project/environment above. Clients cannot override that scope.

Without `VETOLAYER_API_KEY` in production, `/api/v1/*` returns `503 API_AUTH_NOT_CONFIGURED`. Invalid credentials return `401`.

## 6. Public example controls

```text
VETOLAYER_DEMO_WORKSPACE_ID=demo
VETOLAYER_DEMO_RATE_LIMIT_PER_MINUTE=30
```

The `/demo` flow remains a public product example; it is not the authenticated product state.

## 7. Health endpoint

`GET /api/health` is secret-free and reports deployment readiness for SERV, auth, persistence, GitHub, and Developer API configuration.

## 8. Local release gate

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm release:smoke
```

After deployment:

```bash
SMOKE_BASE_URL=https://<your-production-domain> pnpm release:smoke
```

## Failure behavior

- malformed request -> clear `4xx`
- unauthenticated product request -> `401` or sign-in redirect
- authenticated account without a valid product context -> `409 WORKSPACE_CONTEXT_REQUIRED`
- insufficient workspace role -> `403 FORBIDDEN`
- archived project write -> `409 PROJECT_ARCHIVED`
- production workspace persistence missing -> `503 WORKSPACE_PERSISTENCE_REQUIRED`
- invalid Developer API token -> `401`
- rate limit exceeded -> `429` with `Retry-After`
- SERV/provider failure -> conservative `REVIEW`, never accidental `ALLOW`

## Secret handling

Never expose SERV, GitHub, Supabase service-role, or VetoLayer API secrets through `NEXT_PUBLIC_*`. Server logging redacts credential-like metadata, and the release smoke script checks generated browser bundles for configured server-secret values when available.

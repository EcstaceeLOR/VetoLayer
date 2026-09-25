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

Required for real contextual judgment and for completing the authenticated operational onboarding flow:

```text
SERV_API_KEY=...
SERV_MODEL=...
SERV_BASE_URL=https://inference-api.openserv.ai/v1
SERV_TIMEOUT_MS=20000
```

If SERV is unavailable, malformed, or unconfigured, VetoLayer fails safely to `REVIEW`; it never silently approves the action. Operational onboarding goes one step further: its final test is not marked complete unless SERV returns a validated live reasoning result with `providerStatus: ok`.

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

See [`auth-production.md`](auth-production.md) and [`auth-workspaces.md`](auth-workspaces.md).

## 3. Durable product persistence

Durable persistence is required for production workspace creation, GitHub App installations, onboarding progress, and normal product operation. Configure both server-only values:

```text
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Apply the migrations in order:

```text
supabase/migrations/202609250100_workspace_model.sql
supabase/migrations/202609250600_onboarding_state.sql
supabase/migrations/202609250800_github_app.sql
```

The production model includes:

- `vetolayer_workspaces`
- `vetolayer_workspace_members`
- `vetolayer_projects`
- `vetolayer_environments`
- `vetolayer_workspace_invitations`
- `vetolayer_onboarding_states`
- `vetolayer_decisions`
- `vetolayer_policies`
- `vetolayer_review_cases`
- `vetolayer_integration_configs`
- `vetolayer_github_installations`
- `vetolayer_github_repositories`
- `vetolayer_github_install_states`
- `vetolayer_github_webhook_deliveries`

The service-role key never enters browser code. Product routes authenticate the Supabase user, validate workspace membership, role, project ownership, and environment ownership, then perform server-side persistence.

## 4. GitHub App

The product GitHub connection uses a GitHub App. End users do **not** paste personal access tokens and do not edit Vercel variables to connect repositories.

Register one GitHub App for the VetoLayer deployment, then configure:

```text
GITHUB_APP_ID=...
GITHUB_APP_SLUG=...
GITHUB_APP_CLIENT_ID=...
GITHUB_APP_CLIENT_SECRET=...
GITHUB_APP_PRIVATE_KEY=...
GITHUB_APP_WEBHOOK_SECRET=...
```

The private key and webhook secret are server-only. On hosts that require a one-line PEM value, `GITHUB_APP_PRIVATE_KEY` may contain escaped `\n`; VetoLayer restores the line breaks server-side.

Configure the App with:

```text
Homepage URL:
https://<your-production-domain>

Setup / callback URL:
https://<your-production-domain>/api/integrations/github/callback

Webhook URL:
https://<your-production-domain>/api/integrations/github/webhook
```

Enable user authorization during installation so VetoLayer can verify that the signed-in installer is actually authorized to access the returned GitHub installation before binding it to a workspace/project/environment.

Repository permissions are intentionally read-only:

```text
Pull requests:   Read
Checks:          Read
Commit statuses: Read
Metadata:        Read (GitHub-required baseline)
```

Subscribe to the events used for installation health and evidence freshness:

```text
installation
installation_repositories
pull_request
pull_request_review
check_run
check_suite
status
```

VetoLayer signs App JWTs on the server, mints short-lived installation tokens only when needed, caches them only in process memory until shortly before expiry, and never returns or persists them. Webhooks are verified against the raw body with `X-Hub-Signature-256` before any payload is processed. Delivery IDs are persisted to reject duplicate/replayed deliveries.

Users then connect GitHub from **Integrations → GitHub App**. They can install/reinstall the App, refresh real repository access, choose which installation repositories belong to the active VetoLayer scope, test the installation, run a real PR evaluation, and disconnect without deployment access.

See [`github-app.md`](github-app.md) for the security and lifecycle contract.

## 5. Developer API

Production fails closed when the interim Developer API bearer secret is absent:

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
```


## 7. Health endpoint

`GET /api/health` is secret-free and reports deployment readiness for SERV, auth, persistence, GitHub App registration, and Developer API configuration. A healthy App registration does not mean a workspace is connected; scoped installation health is available only on authenticated integration surfaces.

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
- production onboarding persistence missing -> `503 ONBOARDING_PERSISTENCE_REQUIRED`
- invalid/expired GitHub install state -> installation is not bound; user restarts the flow
- GitHub installer cannot prove access to installation -> installation is rejected
- GitHub App removed/revoked/suspended -> scoped integration fails closed to `needs-config`
- GitHub repository not selected for active scope -> evaluation rejected before GitHub evidence collection
- invalid GitHub webhook signature -> `401`; payload is not processed
- duplicate GitHub webhook delivery -> acknowledged and ignored
- invalid Developer API token -> `401`
- rate limit exceeded -> `429` with `Retry-After`
- SERV/provider failure -> conservative `REVIEW`, never accidental `ALLOW`
- onboarding SERV live-check failure -> receipt remains auditable, but onboarding stays incomplete until a validated live SERV result succeeds

## Secret handling

Never expose SERV, GitHub App private/client secrets, webhook secrets, Supabase service-role, or VetoLayer API secrets through `NEXT_PUBLIC_*`. GitHub user authorization tokens are transient, installation tokens are short-lived server memory only, server logging redacts credential-like metadata, and the release smoke script checks generated browser bundles for configured server-secret values when available.

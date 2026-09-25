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

Durable persistence is **required for production workspace creation, onboarding progress, GitHub App installations, and product operation**. Configure both server-only values:

```text
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Apply the migrations in order:

```text
supabase/migrations/202609250100_workspace_model.sql
supabase/migrations/202609250600_onboarding_state.sql
supabase/migrations/202609250730_github_app.sql
```

The production model includes:

- `vetolayer_workspaces`
- `vetolayer_workspace_members`
- `vetolayer_projects`
- `vetolayer_environments`
- `vetolayer_workspace_invitations`
- `vetolayer_onboarding_states`
- `vetolayer_github_installations`
- `vetolayer_decisions`
- `vetolayer_policies`
- `vetolayer_review_cases`
- `vetolayer_integration_configs`

The workspace migration adds project/environment scope indexes to the existing operational tables and provides a one-time bridge for historical `user:<id>` workspaces. The onboarding migration stores only resume selections and the receipt reference; VetoLayer revalidates real workspace, integration, policy, SERV, and receipt state every time onboarding loads. The GitHub migration stores installation/repository metadata only and contains no credential columns.

The service-role key never enters browser code. Application routes authenticate the Supabase user, validate workspace membership, role, project ownership, and environment ownership, then perform server-side persistence.

## 4. GitHub App

Required when a workspace uses the GitHub coding-agent gate. Register one GitHub App for the VetoLayer deployment, then configure its server-only credentials:

```text
GITHUB_APP_ID=...
GITHUB_APP_SLUG=...
GITHUB_APP_CLIENT_ID=...
GITHUB_APP_CLIENT_SECRET=...
GITHUB_APP_PRIVATE_KEY=...
GITHUB_APP_WEBHOOK_SECRET=...
```

Production URLs:

```text
Homepage:   https://<your-production-domain>
Callback:   https://<your-production-domain>/api/github/install/callback
Setup URL:  https://<your-production-domain>/api/github/install/setup
Webhook:    https://<your-production-domain>/api/github/webhook
```

Normal product users do **not** edit environment variables or paste GitHub personal tokens. Owners/Admins choose **Connect GitHub** in VetoLayer, install the App, and select repositories in GitHub.

VetoLayer validates post-install `installation_id` values against the authorizing GitHub user before attaching them to a workspace/project/environment. Temporary user tokens are discarded after setup. Installation tokens are minted server-side on demand and are never persisted or returned to browser code.

See [`github-app.md`](github-app.md) for permissions, webhook subscriptions, registration, and lifecycle details.

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

The `/demo` flow remains a public product example; it is not the authenticated product state and its seeded receipts never satisfy operational onboarding completion.

## 7. Health endpoint

`GET /api/health` is secret-free and reports deployment readiness for SERV, auth, persistence, GitHub App infrastructure, and Developer API configuration. A specific workspace is only GitHub-connected when that product scope also has an active verified installation.

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
- invalid GitHub webhook signature -> `401 INVALID_SIGNATURE`
- unavailable/suspended GitHub installation -> connection marked visibly unavailable; live evaluation fails closed
- invalid Developer API token -> `401`
- rate limit exceeded -> `429` with `Retry-After`
- SERV/provider failure -> conservative `REVIEW`, never accidental `ALLOW`
- onboarding SERV live-check failure -> receipt remains auditable, but onboarding stays incomplete until a validated live SERV result succeeds

## Secret handling

Never expose SERV, GitHub App private/client/webhook secrets, Supabase service-role, or VetoLayer API secrets through `NEXT_PUBLIC_*`. GitHub user tokens used to verify installation ownership and installation access tokens used for evidence collection are ephemeral and are never stored. Server logging redacts credential-like metadata, and the release smoke script checks generated browser bundles for configured server-secret values when available.

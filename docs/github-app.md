# GitHub App integration

VetoLayer's production GitHub integration is a GitHub App installation, not a personal access token. A deployment administrator registers the App once; workspace users install and manage repository access from the VetoLayer product.

## Product lifecycle

1. An authenticated workspace user with `integrations.write` starts **Install GitHub App**.
2. VetoLayer creates a cryptographically random one-time state, stores only its SHA-256 hash with the exact workspace/project/environment/user, and expires it after 10 minutes.
3. GitHub runs the App installation flow and user authorization.
4. The callback consumes the state exactly once and revalidates the VetoLayer user's current workspace permission and active project/environment.
5. VetoLayer exchanges the short-lived GitHub OAuth code for a transient user access token and verifies that this GitHub user can access the returned `installation_id`.
6. Only after that proof does VetoLayer bind the installation to the selected product scope.
7. VetoLayer mints a short-lived installation token server-side, reads installation metadata and repository access, then discards the user token.
8. Operators select which available repositories are connected to this VetoLayer scope.

A raw `installation_id` from the callback is never sufficient to establish ownership.

## Least-privilege permissions

The current GitHub Gate only needs read access to evidence:

- **Pull requests: Read** — PR metadata, changed files, and reviews.
- **Checks: Read** — check-run status for the PR head SHA.
- **Commit statuses: Read** — status evidence where present.
- **Metadata: Read** — GitHub's baseline repository metadata permission.

VetoLayer does not request repository content write, pull-request write, administration, actions write, deployments write, secrets, or organization administration for the gate implemented in Issue #56.

## Token boundary

Three GitHub credentials have different jobs:

- **App private key**: deployment secret used to sign short-lived App JWTs. Never enters browser code.
- **User access token during installation**: transient server-side proof that the signed-in GitHub user can access the returned installation. It is not persisted.
- **Installation access token**: minted server-side for one GitHub App installation, cached only in process memory, and refreshed shortly before expiry. It is not persisted or returned to the browser.

The browser receives installation/account/repository metadata only.

## Webhooks

Webhook endpoint:

```text
POST /api/integrations/github/webhook
```

VetoLayer reads the raw request body first and verifies `X-Hub-Signature-256` using the configured webhook secret and a constant-time comparison. Invalid signatures are rejected before JSON processing.

`X-GitHub-Delivery` is stored as a unique delivery identifier so retried/replayed deliveries are acknowledged without being processed twice.

Installation lifecycle behavior:

- uninstall/delete -> connection becomes `revoked` and generic integration readiness becomes `needs-config`;
- suspend -> connection becomes `suspended` and fails closed;
- unsuspend / permission acceptance / repository selection changes -> installation and repository access are refreshed from GitHub;
- pull request / review / checks / status -> signed event activity updates connection health; raw webhook payloads are not retained by this subsystem.

## Repository selection

GitHub controls which repositories the App installation may access. VetoLayer adds a second scope boundary: an operator must explicitly select which of those installation repositories belong to the active VetoLayer workspace/project/environment.

A repository can be evaluated only when:

1. the active VetoLayer scope has a `ready` GitHub installation;
2. GitHub currently exposes that repository to the installation; and
3. the repository is marked connected inside VetoLayer for that exact scope.

Repository IDs supplied by the browser are validated against the server-side synchronized list.

## Live evaluation

Authenticated endpoint:

```text
POST /api/integrations/github/evaluate
```

Input identifies a connected repository, pull-request number, and supported gate operation. VetoLayer then:

1. mints/reuses a short-lived installation token;
2. calls the existing `@vetolayer/github-gate` evidence adapter;
3. runs deterministic policy evaluation and SERV contextual reasoning;
4. creates a scope-bound Decision Receipt;
5. persists the decision as `source: integration`;
6. creates a real Human Review case when the outcome is `REVIEW`.

If GitHub evidence cannot be collected, the endpoint fails safely and no action is approved.

## Disconnect vs uninstall

**Disconnect in VetoLayer** removes this product scope's binding and repository selection. It does not silently uninstall the App from the GitHub account because another VetoLayer project/environment may legitimately use the same installation.

**Uninstall in GitHub** is detected through signed installation webhooks and marks every VetoLayer scope mapped to that installation as revoked.

## Data persisted

VetoLayer persists:

- GitHub installation ID and account identity;
- product scope IDs;
- installation permission metadata and health state;
- repository IDs/names/default branches and VetoLayer selection state;
- last synchronization/event timestamps;
- one-time installation-state hashes;
- webhook delivery IDs for replay prevention.

VetoLayer does **not** persist:

- App private key in application tables;
- OAuth client secret in application tables;
- webhook secret in application tables;
- GitHub user access tokens;
- GitHub installation access tokens;
- raw webhook payloads.

## Required database migration

Apply:

```text
supabase/migrations/202609250800_github_app.sql
```

Production refuses to begin a GitHub installation when durable GitHub App persistence is unavailable.

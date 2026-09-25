# GitHub App integration

VetoLayer connects GitHub through a **GitHub App installation**, not a personal access token. The deployment operator registers the App once; workspace users then install it from the VetoLayer Integrations UI and choose the repositories it may inspect.

## Registration

Create a GitHub App for the VetoLayer deployment and configure:

```text
Homepage URL
https://<your-vetolayer-domain>

Callback URL
https://<your-vetolayer-domain>/api/github/install/callback

Setup URL
https://<your-vetolayer-domain>/api/github/install/setup

Webhook URL
https://<your-vetolayer-domain>/api/github/webhook
```

Keep **Request user authorization (OAuth) during installation** disabled. VetoLayer intentionally uses the Setup URL first, then starts a separate OAuth + PKCE authorization flow so it can independently verify the `installation_id` GitHub sends after installation.

Do not enable wildcard callback matching. The production callback should match the registered callback URL exactly.

Enable webhooks and set a strong webhook secret.

## Repository permissions

Use the least privilege needed by the evidence collector:

| Permission | Access | Why |
| --- | --- | --- |
| Checks | Read | Current check-run status on the pull request head commit |
| Contents | Read | Repository metadata required by installation/repository APIs |
| Pull requests | Read | PR metadata, changed files, and reviews |
| Metadata | Read | GitHub App baseline metadata access |

VetoLayer does not require repository write permissions for the GitHub Gate. It evaluates before execution; it does not merge or deploy on behalf of GitHub users.

## Webhook events

Subscribe to:

- `check_run`
- `check_suite`
- `pull_request`
- `pull_request_review`

GitHub installation lifecycle/repository events are also processed when delivered. VetoLayer uses them to mark installations suspended/uninstalled and refresh repository inventory. Webhooks never create a VetoLayer workspace connection by themselves; a signed-in authorized VetoLayer user must complete the install authorization flow first.

## Server environment

After creating the App, configure these **server-only** values:

```text
GITHUB_APP_ID=<numeric app id>
GITHUB_APP_SLUG=<app slug>
GITHUB_APP_CLIENT_ID=<client id>
GITHUB_APP_CLIENT_SECRET=<client secret>
GITHUB_APP_PRIVATE_KEY=<PEM private key>
GITHUB_APP_WEBHOOK_SECRET=<webhook secret>
```

If your host requires a single-line private key, replace PEM newlines with literal `\n`; VetoLayer normalizes them server-side.

None of these values may use a `NEXT_PUBLIC_` prefix.

## Database migration

Apply:

```text
supabase/migrations/202609250730_github_app.sql
```

It creates `vetolayer_github_installations`, scoped by workspace/project/environment. The table stores only durable installation metadata and repository inventory.

It deliberately has **no token columns**.

## User connection flow

1. An Owner/Admin opens **Integrations → Connect GitHub**.
2. VetoLayer signs a short-lived state containing the authenticated user and exact workspace/project/environment.
3. GitHub lets the user install VetoLayer and choose repositories.
4. GitHub redirects to the Setup URL with an `installation_id`.
5. VetoLayer does **not** trust that ID yet. It starts an OAuth web flow with PKCE.
6. The OAuth callback exchanges the code for a temporary GitHub user token.
7. VetoLayer asks GitHub for installations accessible to that user and verifies the returned installation belongs to the configured VetoLayer App.
8. That temporary user token is discarded.
9. VetoLayer uses its App private key to mint a short-lived installation token, enumerates real repositories, persists only metadata, and connects the installation to the exact VetoLayer scope.

A user cannot connect an installation to a different VetoLayer scope by editing callback/query parameters: signed state binds the user, workspace, project, environment, expiry, and installation authorization flow.

## Installation-token lifecycle

GitHub installation tokens are created server-side only when VetoLayer needs to:

- refresh repository inventory; or
- collect evidence for a live pull-request evaluation.

They are never persisted and never returned to browser code. The existing `@vetolayer/github-gate` package receives the short-lived token internally, collects PR/check/review/file evidence, and returns a Decision Receipt scoped to the current workspace/project/environment.

## Webhook verification

`POST /api/github/webhook` reads the raw request body and verifies `X-Hub-Signature-256` with HMAC-SHA256 using `GITHUB_APP_WEBHOOK_SECRET` and a constant-time comparison. Invalid signatures receive `401` before payload processing.

## Lifecycle states

The Integrations surface distinguishes:

- `active` — installation exists and repository inventory can be refreshed;
- `suspended` — GitHub suspended the installation; decisions cannot use it;
- `uninstalled` — GitHub no longer has the installation; reconnect is required;
- `error` — reserved for durable provider errors that require attention.

Repository changes can be refreshed manually and are also refreshed after relevant GitHub installation webhooks.

**Disconnect from scope** removes the VetoLayer workspace/project/environment attachment only. **Manage on GitHub** opens GitHub's installation settings, where repository access can be changed or the App can be uninstalled.

## Live proof

The Integrations page includes **Evaluate a real pull request**. It requires an active installation and one of its real repositories, then calls:

```text
POST /api/github/evaluate
```

The server mints an installation token, gathers current evidence with the existing GitHub Gate, evaluates deterministic policy + SERV contextual reasoning, persists the Decision Receipt, and returns only the receipt and non-secret pull-request summary to the browser.

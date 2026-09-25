# Settings Center

Issue #64 makes `/dashboard/settings` the administrative entry point for VetoLayer. It intentionally reuses the product's existing authoritative stores rather than copying configuration into a second settings database.

## Sections and sources of truth

- **Workspace, members, projects, environments** use the workspace model/store and the existing server-authorized workspace APIs.
- **Integrations** read the GitHub App installation and repository selection state. Provider-level GitHub App credentials remain deployment/platform secrets; per-workspace installation, repository selection, refresh, test, and disconnect are product configuration.
- **API keys and webhooks** use the Developer Console store. API secrets and webhook signing secrets are never read back into Settings. Keys are displayed by safe prefix only.
- **Notifications** use the existing per-user workspace preference store.
- **Security/account** links to the authenticated account-security flow for display name, verified email changes, password changes, and session revocation.
- **Data retention** is persisted in `vetolayer_workspace_settings` with an optimistic `revision`.
- **Danger zone** actions use the same server APIs as the rest of the product and remain auditable.

## Authorization

The Settings UI is permission-aware, but the UI is never the authorization boundary. Every mutation is checked again on the server using workspace permissions:

- `workspace.manage`: workspace profile and retention policy
- `members.manage`: invitations, member roles, removal
- `projects.manage`: project creation/rename/archive
- `environments.manage`: environment creation/rename/archive
- `integrations.read` / `integrations.write`: connection and developer credential visibility/actions
- `decisions.read`: personal notification preferences

Only the workspace owner can archive a workspace. Ownership cannot be reassigned through a normal role edit.

## Concurrency

Settings must not silently overwrite a newer administrative change.

- Retention settings use an atomic integer revision. Supabase writes include the expected revision and return `409 SETTINGS_CONFLICT` if another writer has already changed the row.
- Workspace, project, and environment edit/archive requests carry the `updatedAt` value the form was rendered with. The server compares it with current persisted state and returns `409 SETTINGS_CONFLICT` before writing when stale.
- Notification preference updates carry their previously loaded `updatedAt` timestamp and reject stale writes.
- Member role/removal APIs accept the previously observed role so clients can detect a role transition made by another administrator.

A 409 asks the administrator to refresh and review the current value instead of replaying the stale write.

## Retention policy

Supported operational retention windows are 30, 90, 180, 365, or 730 days, plus `0` for indefinite retention. Defaults are:

- Decision Receipts: 365 days
- Review cases: 365 days
- Notification/product events: 90 days
- Security audit events: **indefinite**

The append-only audit log is deliberately excluded from configurable retention.

Shortening any configured operational window is destructive. The UI requires the phrase `APPLY RETENTION`; the API also validates that phrase. Once the revisioned policy is saved, the server immediately applies the shorter window. A protected daily worker then keeps configured workspaces within policy.

`vetolayer_apply_workspace_retention` deletes eligible old operational records and writes a system `retention.apply` audit event when records were actually removed. `vetolayer_apply_all_retention` is available only to the Supabase service role and powers the scheduled worker.

## Retention worker

Vercel invokes `/api/internal/retention` daily at 03:00 UTC. In production, the endpoint requires either `VETOLAYER_RETENTION_WORKER_SECRET` or Vercel's `CRON_SECRET` bearer token. These are platform-level infrastructure credentials, not normal product configuration.

The worker endpoint and database RPCs are not exposed to workspace users.

## Destructive actions and historical data

Settings explains effects before executing destructive actions:

- **Disconnect GitHub:** stops new GitHub evaluations. Existing signed decisions remain until their workspace decision retention period expires. Audit history remains indefinitely.
- **Archive environment/project:** prevents new governed activity in the archived scope; retained history is still available according to retention policy.
- **Archive workspace:** removes the workspace from active selection. Retained operational records remain until policy cleanup; audit events stay append-only.

All destructive administrative actions emit audit events. Retention itself also emits a system audit event when it removes records.

## Credential handling

Sensitive credentials are write-only/masked by design:

- API bearer key plaintext appears only on key creation/rotation in Developer Console.
- Webhook signing secret plaintext appears only on creation/rotation.
- GitHub App private key/client secret/webhook secret remain server environment/platform credentials.
- Settings never serializes key hashes, encrypted webhook secrets, provider access tokens, authorization headers, passwords, cookies, or session tokens into the browser.

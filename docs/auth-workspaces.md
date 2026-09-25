# Authentication, workspaces, projects, environments, and roles

VetoLayer uses Supabase Auth through `@supabase/ssr` and a server-owned organization model. Authentication answers **who the user is**; workspace membership answers **which product data they may access**.

The public marketing site and invitation acceptance can be opened without a workspace. Product routes require an authenticated account, and operational routes require a validated workspace → project → environment context.

## Auth environment

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
NEXT_PUBLIC_APP_URL=https://<your-vetolayer-host>
```

`SUPABASE_SERVICE_ROLE_KEY` is separate and remains server-only. Enable email/password authentication and add the deployed VetoLayer origin plus `/auth/callback` to Supabase Auth's allowed redirect URLs.

## Product ownership model

```text
Workspace
├── members
│   ├── owner
│   ├── admin
│   ├── reviewer
│   └── member
└── projects
    └── environments
        ├── development
        ├── staging
        ├── production
        └── custom
```

A signed-in user may belong to multiple workspaces. The current workspace, project, and environment are remembered in HTTP-only cookies, but cookies are only **preferences**: every request resolves them against server-side membership and parent relationships before any data is read or mutated.

Clients cannot make themselves members of an arbitrary workspace, attach an environment to a different project, or use a remembered stale ID to cross workspace boundaries.

## Role permissions

| Capability | Owner | Admin | Reviewer | Member |
| --- | :---: | :---: | :---: | :---: |
| Read decisions | ✓ | ✓ | ✓ | ✓ |
| Read policies/integrations | ✓ | ✓ | ✓ | ✓ |
| Resolve human reviews | ✓ | ✓ | ✓ | — |
| Edit policies/integrations | ✓ | ✓ | — | — |
| Manage projects/environments | ✓ | ✓ | — | — |
| Invite/remove members | ✓ | ✓* | — | — |
| Rename workspace | ✓ | ✓ | — | — |
| Archive workspace | ✓ | — | — | — |

`*` Admins may assign Reviewer or Member. They cannot create another Admin, change/remove an Admin, or transfer ownership. The Owner cannot be removed or silently downgraded through member-management endpoints.

Permission checks happen in server route handlers as well as the UI. Hiding a button is never the authorization boundary.

## Workspace creation

Onboarding creates, server-side:

1. one Workspace;
2. one Owner membership for the authenticated Supabase user;
3. the first Project;
4. Development, Staging, and Production environments;
5. the user's current-context cookies, initially selecting Production.

Production workspace creation fails closed when durable Supabase persistence is not configured. Local development may use the in-memory store.

## Invitations

Workspace admins create invitations by email and role. VetoLayer generates a random one-time token and persists only its SHA-256 hash. Invitations expire after seven days.

Acceptance requires:

- a signed-in Supabase account;
- an invitation that is still pending and unexpired;
- the signed-in email to match the invited email exactly;
- an active destination workspace.

After acceptance, VetoLayer creates the membership and switches the user into an active project/environment in that workspace.

## Project and environment lifecycle

Projects and environments are real persisted entities. New projects receive Development, Staging, and Production by default. Custom environments can be added.

Archiving is intentionally non-destructive:

- archived projects/environments remain stored;
- existing decisions and receipts remain stored;
- archived projects cannot accept new policy, integration, or review mutations;
- a project must retain at least one active environment.

The current product switcher shows active contexts. The Workspace management surface lists archived entities so historical ownership remains visible.

## Scoped product data

The following records carry `workspace_id`, `project_id`, and `environment_id` where relevant:

- decisions / Decision Receipts;
- policies;
- human review cases;
- integration status;
- Developer API-created decisions through its server-owned service scope.

Authenticated APIs always resolve scope server-side and pass it to storage. Decision Receipts created after Issue #54 also embed the workspace/project/environment IDs (and human-readable names when available) inside the receipt's SHA-256-protected content.

Historical receipts remain valid: pre-#54 receipt JSON is not rewritten merely to add scope because that would invalidate its integrity hash.

## Developer API scope

Until the Developer Console in Issue #57 creates first-class API keys, the production bearer key is bound server-side to one explicit service scope:

```text
VETOLAYER_API_WORKSPACE_ID=service:developer-api
VETOLAYER_API_PROJECT_ID=service:default-project
VETOLAYER_API_ENVIRONMENT_ID=service:production
```

Clients cannot override those values in request headers or payloads.

## Database migration

Run:

```text
supabase/migrations/202609250100_workspace_model.sql
```

The migration creates:

- `vetolayer_workspaces`
- `vetolayer_workspace_members`
- `vetolayer_projects`
- `vetolayer_environments`
- `vetolayer_workspace_invitations`

It also adds `project_id` and `environment_id` to the existing decision, policy, review, and integration tables and creates compound scope indexes.

RLS remains enabled. VetoLayer's current product stores use the service-role key only from server code after membership and scope have been established by the application.

## Migrating legacy `user:<id>` history

Before Issue #54, authenticated product data used an implicit ID:

```text
user:<supabase-user-id>
```

New workspace creation records that value as `legacy_workspace_id`. Once the new workspace/project/environment exist, an administrator can migrate prior history with:

```sql
select public.vetolayer_migrate_legacy_workspace(
  'user:<supabase-user-id>',
  'ws_<new-workspace-id>',
  'prj_<new-project-id>',
  'env_<new-environment-id>'
);
```

The function:

- moves legacy rows to the real workspace;
- fills project/environment scope;
- re-namespaces record primary keys to the new store format;
- leaves historical receipt JSON untouched so its original integrity hash remains valid;
- is revoked from the public role and intended only for an administrative migration session.

Run it once per legacy account after that account has created its real workspace.

## Route boundaries

Public:

- `/`
- `/pricing`
- `/login`, verification/recovery routes
- `/invite/[token]`
- `/api/health`
- `/api/readiness`
- `/api/v1/*` — separate bearer-key service scope

Authenticated identity:

- `/onboarding`
- `/account`
- workspace invitation acceptance

Authenticated + validated product context:

- `/dashboard/*`
- `/api/decisions`
- `/api/policies` and simulation
- `/api/reviews/*`
- `/api/integrations/status`
- `/api/workspaces/*` according to role

The Next.js proxy refreshes Supabase sessions and route handlers independently verify identity, membership, role, and entity relationships rather than trusting browser state.

# VetoLayer production QA — 2026.09

This checklist is the final product-quality gate for issue #69. Production means normal authenticated/public product routes with `NODE_ENV=production`; seeded fixtures are permitted only inside the explicit public demo/sandbox and the CI-only reliability seam.

## Public website
- [x] `/` uses the production VetoLayer identity and real product capabilities; no fake customer counts, certifications, or customer logos.
- [x] `/pricing` describes real plan entitlements and does not expose a fake checkout flow.
- [x] `/demo` remains an explicitly labelled sandbox/example and is not required by any primary production or browser-reliability journey.
- [x] Unknown routes render the branded global 404 with actionable links.

## Authentication and account
- [x] `/login`, signup, callback, and password recovery use Supabase-backed flows with actionable errors.
- [x] `/account` exposes real profile/session/security actions.
- [x] `/account/offboarding` uses the durable lifecycle job system and ownership safeguards.

## Onboarding
- [x] Workspace/project/environment creation is persisted through product APIs.
- [x] No normal dashboard route relies on seeded onboarding state.
- [x] Browser reliability covers a fresh onboarding identity and persisted selection state.

## Dashboard and analytics
- [x] Production dashboard loaders can only return durable live data or an honest empty state.
- [x] Legacy Acme/Northstar/Vector dashboard fixtures are disabled when `NODE_ENV=production`.
- [x] Analytics uses persisted decisions/reviews/audit data and exposes source availability rather than invented zeros.

## Decisions and receipts
- [x] Decision Explorer uses stable deep links, indexed filters, pagination, lineage, verification, and safe exports.
- [x] Provider degradation is browser-tested to fail closed as `REVIEW`.
- [x] Receipt integrity and lineage are never overwritten by review re-evaluation.

## Policies
- [x] Policy Studio has real lifecycle/version actions; published versions are immutable.
- [x] Browser QA loads the real Policy Studio surface with no generic application error.

## Human Review
- [x] The browser reliability journey no longer calls `/demo` or `/api/demo/*` for its core review check.
- [x] CI invokes the same `reevaluateReviewCase()` orchestrator used by production Human Review actions and asserts a new child receipt.
- [x] Review queue/workspace routes render without console errors.

## Integrations
- [x] GitHub uses the GitHub App installation model; no PAT setup is required from users.
- [x] Integration failures are sanitized and represented through product health/audit/notification surfaces.

## Developer Console
- [x] API-key lifecycle and real `/api/v1/evaluate` are browser-tested.
- [x] Revoked keys are rejected by the real server auth boundary.
- [x] Webhook endpoints, signing, rotation, history, retries, and tests are real server actions.

## Settings, administration, billing, and data
- [x] Workspace/member/project/environment/settings mutations are server-authorized and audited.
- [x] Notification preferences use conflict-safe persistence.
- [x] Retention, export, removal, ownership transfer, and account offboarding are real durable workflows.
- [x] Plan limits are enforced on the server; paid checkout is not displayed without a provider.

## Notifications and audit
- [x] Notification center has persisted unread state and preferences.
- [x] Audit log is append-only at both application and database layers.

## Documentation and help
- [x] `/dashboard/docs` and stable topic routes are shipped product surfaces.
- [x] Contextual links point to implemented documentation routes.

## Error, loading, and browser quality
- [x] Root and dashboard error boundaries are branded, recoverable, and report sanitized references.
- [x] Global 404 is branded and actionable.
- [x] Decision loading/not-found/error states are purpose-built.
- [x] Browser QA visits all core dashboard routes and fails on generic application/server error pages.
- [x] Browser QA fails on uncaught runtime exceptions and console errors.
- [x] Final screenshots are captured from real login/onboarding/developer/review product state, not from the public demo.

## Explicitly non-production fixtures

The following are allowed only because they cannot silently enter normal production state:
- `/demo` and `/api/demo/*`: labelled public sandbox/example.
- `VETOLAYER_E2E_MODE=1` reliability session: CI-only, disabled on Vercel/normal runtime.
- `apps/web/lib/dashboard-data.ts`: legacy development fixtures; exported array is empty when `NODE_ENV=production`.

Any future seeded fixture must stay behind one of these explicit boundaries and must not become a dependency of login, onboarding, dashboard, policy, review, integration, decision, or settings journeys.

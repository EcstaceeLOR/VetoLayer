# VetoLayer release checklist

Use this before every public deployment or hackathon submission refresh.

## Repository gate

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e:browser
pnpm release:smoke
```

CI runs the equivalent sequence for every pull request to `main`, including browser artifact upload after Chrome E2E.

The final gate proves:

- frozen dependency installation;
- lint and TypeScript correctness across workspace packages;
- package + web regression/safety tests;
- production Next.js build;
- real headless-Chrome navigation against the compiled `next start` app;
- onboarding, integration readiness, policy state, API-key create/use/revoke, provider degradation, Human Review re-evaluation, Decision Explorer and primary dashboard surfaces;
- SERV network failure fails closed to `REVIEW` with fallback provider status;
- browser performance budgets;
- zero unhandled runtime exceptions across the core journey;
- zero unexpected browser-console errors across primary dashboard routes;
- branded global 404/recovery behavior;
- release-critical source/artifact/docs contracts;
- secret scanning of generated client assets when release secrets are available.

## Deployed-production gate

The repository includes `.github/workflows/production-smoke.yml`.

It runs every six hours and supports manual dispatch. The workflow sets `SMOKE_BASE_URL` from the dispatch input or repository variable and executes:

```bash
pnpm release:smoke
```

against the deployed production URL from GitHub-hosted infrastructure.

For a manual local-equivalent probe:

```bash
SMOKE_BASE_URL=https://your-vetolayer-domain.example pnpm release:smoke
```

Do not call a release submission-ready until the latest `main` commit is actually deployed and this deployed smoke succeeds.

## Health vs readiness

- `/api/health` is liveness/secret-free service health.
- `/api/readiness` is the stricter production-readiness contract for required persistence/auth/provider configuration.

A process being alive is not proof that the product is safe to serve.

## Manual final-release checks

These still require the deployed browser or external credentials.

### 1. Public product and account flow

- Open `/` logged out.
- Confirm public navigation and pricing render correctly.
- Sign in with a presentation/test account.
- Confirm onboarding and dashboard stay within the authenticated workspace/project/environment scope.
- Confirm canonical auth redirects return to the production host.

### 2. Flagship product workflow

Use real product state rather than relying on the authenticated product:

- open a prepared action/receipt that is in `REVIEW` because required evidence is missing;
- confirm deterministic and SERV/contextual findings are visible;
- open the exact Human Review case;
- add the required approval/evidence;
- re-evaluate through the normal workflow;
- confirm a new Decision Receipt is created with parent lineage;
- confirm any `ALLOW` occurs only after all policy/evidence requirements are satisfied.

If provider trace reports fallback, do not present the contextual evaluation as successful SERV reasoning.

### 3. Policy path

- Open Policy Studio.
- Confirm active policy/version state is real persisted data.
- Run one deterministic simulation.
- Run one contextual simulation with SERV configured.
- Confirm failures do not fail open.

### 4. Decision Explorer / Receipt Center

- search/filter real decisions;
- open a stable receipt deep link;
- verify receipt integrity;
- inspect lineage and review state;
- optionally compare two receipts / export the incident summary.

### 5. Integrations + Developer Console

- confirm GitHub App or Developer API readiness used in the presentation;
- create/use/revoke a scoped test API key if showing the API path;
- verify webhook/API/GitHub secret values never appear in UI/network output;
- do not reveal one-time keys in screenshots after capture.

### 6. Notifications / Audit / Analytics

- open notification center and confirm review alerts deep-link to the correct case if available;
- open append-only Audit and confirm filters/deep links render without raw secrets;
- open Analytics and confirm metrics are based on real persisted data rather than seeded fixtures.

### 7. Data / settings / plans

- confirm settings reflect persisted workspace/project/integration/security state;
- confirm retention/data export/offboarding controls explain destructive effects;
- confirm plan/usage numbers are real data and no fake checkout is shown.

### 8. Browser console and errors

- keep browser devtools open during the presentation route sweep;
- no unexpected console errors or raw provider/server messages;
- 404/permission/error states should be branded and actionable.

### 9. Secret hygiene

- inspect browser network responses; raw server credentials must never be returned;
- inspect deployment logs for accidental values of SERV/GitHub/Supabase/webhook/API/worker secrets;
- confirm secret-bearing `.env*` files are not committed or served.

## Optional public sandbox

the authenticated product remains useful as a no-account supporting proof surface, but it is not part of the primary product-completeness requirement.

If shown:

- seeded scenario inputs must remain visibly labelled;
- the initial result should be safe `REVIEW` when approval evidence is missing;
- adding sandbox reviewer evidence must trigger re-evaluation rather than directly toggling the outcome;
- provider fallback must remain visible and safe;
- use Reset between repeated presentations.

## SERV Hackathon release decision

Ship/submit only when:

- repository CI is green;
- latest `main` is deployed to the final public URL;
- deployed Production Smoke passes against that exact release;
- the real flagship workflow can be shown without developer intervention;
- intended integrations report expected readiness;
- browser console is clean through presentation routes;
- no secret values appear in client assets, browser output, screenshots, or public logs;
- final screenshots/GIFs were captured from the verified deployment;
- there is no known path that turns uncertainty, missing evidence, provider failure, malformed reasoning, or missing API authentication into accidental authority.

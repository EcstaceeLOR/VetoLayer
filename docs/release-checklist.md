# VetoLayer release checklist

Use this before every public deployment or hackathon demo refresh. The goal is to verify the critical product path without adding heavyweight deployment infrastructure.

## Automated gate

Run from the repository root:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm release:smoke
```

CI runs this sequence for every pull request to `main`.

`pnpm release:smoke` verifies that:

- landing, sign-in, onboarding, demo, dashboard, health, demo-review, and demo-reset surfaces exist;
- `vercel.json`, the production Next.js configuration, and the complete web environment template are present;
- the behavioral proof tests for Policy Studio, orchestration, SERV failure handling, Decision Receipts, canonical auth redirects, and the flagship HTTP flow remain part of `pnpm test`;
- the public demo calls the initial evaluation, human-review re-evaluation, and server reset endpoints;
- `/api/demo/evaluate` cannot be asked to jump directly to the resolved stage;
- the Next.js production build exists;
- actual server-secret values are absent from generated client bundles when those values are present in the release environment.

To probe a deployed release over HTTP:

```bash
SMOKE_BASE_URL=https://your-vetolayer-domain.example pnpm release:smoke
```

The live probe checks the public landing/login/demo surfaces, authentication redirects, and `/api/health`. It requires `demoReady: true`, so a deployment without working SERV configuration cannot be marked submission-ready.

## Behavioral proof already automated

The normal test suite covers the release-critical decision behavior:

- deterministic policy evaluation;
- SERV structured contextual reasoning;
- safe REVIEW fallback when SERV is unavailable or malformed;
- orchestrator precedence rules;
- Decision Receipt generation and integrity verification;
- same flagship action moving from REVIEW to ALLOW only after a `HumanReviewRecord` adds the required approval evidence;
- public demo HTTP flow and direct-resolved-stage bypass rejection;
- production Developer API failing closed when bearer auth is not configured;
- canonical app-origin and safe internal redirect handling.

## Manual release checks

These remain manual because they depend on the deployed browser experience or live external credentials.

### 1. Public flagship demo — no login required

- Open `/demo` in a logged-out/private browser.
- Confirm the page visibly labels PR/incident/CI/reviewer data as seeded demo inputs.
- Run **1. Evaluate current action** and confirm the action reaches `REVIEW` when security approval is missing.
- Confirm provider status is real SERV success, not a fallback disguised as success.
- Run **2. Add demo security-lead approval & re-evaluate**.
- Confirm the same action is evaluated again and can become `ALLOW` only if SERV + policy evidence support it.
- Confirm the Decision Receipt hash changes between evaluations.
- Use **Reset demo** and verify the server reset succeeds and the page returns to the initial state.

### 2. Health/readiness

Open `/api/health` and verify:

- `status` is `ok`;
- `demoReady` is `true`;
- `serv` is `configured`;
- any product integrations you intend to demonstrate report the expected readiness state.

No secret values should appear in this response.

### 3. Authentication and product shell

If Supabase Auth is configured:

- create/sign in with a test account;
- confirm `/dashboard` loads the authenticated workspace rather than another user's data;
- confirm `/onboarding` stays in the same workspace;
- confirm confirmation links return to the canonical production host, not a preview/spoofed Origin.

### 4. Policy path

- Open Policy Studio.
- Run a deterministic policy simulation and confirm an outcome is returned.
- With SERV configured, run a contextual policy simulation and confirm provider trace metadata is visible.

### 5. Failure safety

In a non-production test environment, temporarily make SERV unavailable or invalid. Re-run a contextual evaluation and confirm VetoLayer returns REVIEW/fallback behavior rather than silently ALLOWing the action.

### 6. GitHub Gate

If `GITHUB_TOKEN` is configured:

- confirm Integrations reports the expected GitHub account/configuration state;
- exercise a real PR evidence collection path;
- verify GitHub token values never appear in browser responses or logs.

### 7. Developer API

On the public production deployment:

- if `VETOLAYER_API_KEY` is omitted, confirm `/api/v1/evaluate` returns `503 API_AUTH_NOT_CONFIGURED`;
- if a key is configured, confirm requests without/with a wrong bearer token return `401`;
- confirm an authorized request is scoped to the server-owned `VETOLAYER_API_WORKSPACE_ID`.

### 8. Receipt and audit trail

- inspect a resulting Decision Receipt;
- confirm action, policies, evidence/requirements, decision trace, outcome, timestamp, and integrity hash are present;
- if persistence is configured, confirm dashboard drill-down resolves the stored decision/review state.

### 9. Secret hygiene

- inspect browser devtools/network responses; raw server credentials must never be returned;
- search deployment logs for accidental values of `SERV_API_KEY`, `GITHUB_TOKEN`, `VETOLAYER_API_KEY`, or the Supabase service-role secret;
- confirm `.env*` files containing secrets are not committed or served.

## Release decision

Ship only when:

- CI is green;
- `pnpm release:smoke` passes;
- the deployed HTTP smoke probe passes for the public URL;
- `/api/health` reports `demoReady: true`;
- the logged-out `/demo` flow completes without developer intervention;
- all manual checks above that apply to the configured environment are complete;
- there is no known path that turns uncertainty, missing evidence, provider failure, malformed reasoning, or missing API authentication into accidental authority.

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

CI runs this same sequence for every pull request to `main`.

`pnpm release:smoke` verifies that:

- the landing, sign-in, onboarding, demo, and dashboard route surfaces are present in the production build source tree;
- the behavioral proof tests for Policy Studio, orchestration, SERV failure handling, Decision Receipts, and the flagship GitHub scenario are present and already executed by `pnpm test`;
- the flagship demo exposes an explicit reset path;
- the Next.js production build exists;
- known server-secret values are absent from generated client bundles when those values are present in the release environment.

To probe a deployed release over HTTP as well:

```bash
SMOKE_BASE_URL=https://your-vetolayer-domain.example pnpm release:smoke
```

That checks the public landing, login, and demo pages and confirms protected onboarding/dashboard routes return a valid page or authentication redirect.

## Behavioral proof already automated

The normal test suite covers the release-critical decision behavior:

- deterministic policy evaluation;
- SERV structured contextual reasoning;
- safe REVIEW fallback when SERV is unavailable or malformed;
- orchestrator precedence rules;
- Decision Receipt generation and integrity verification;
- the flagship deployment scenario moving from REVIEW to ALLOW only after the required approval evidence changes.

A green `pnpm test` is therefore part of the release gate, not a separate optional check.

## Manual release checks

These remain manual because they depend on the deployed browser experience or live external credentials.

### 1. Public product surfaces

- Open `/` and confirm the landing page renders without console-breaking errors.
- Open `/demo` and confirm the seeded scenario is clearly labeled as demo data using the real decision pipeline.
- Use **Reset demo** after an evaluation and confirm the experience returns to the initial state.

### 2. Authentication and product shell

- Sign in with a test account.
- Confirm `/dashboard` loads the authenticated workspace rather than another user's data.
- Confirm `/onboarding` loads and routes back into the same workspace.

### 3. Policy path

- Open Policy Studio.
- Run a deterministic policy simulation and confirm an outcome is returned.
- With SERV configured, run a contextual policy simulation and confirm SERV trace/provider metadata is visible.

### 4. Failure safety

- In a non-production test environment, temporarily make SERV unavailable or invalid.
- Re-run a contextual evaluation and confirm the system returns REVIEW/fallback behavior rather than silently ALLOWing the action.

### 5. Flagship GitHub gate

- Confirm GitHub integration readiness shows the expected account/configuration state.
- Exercise the flagship action path.
- Confirm the initial unresolved evidence produces REVIEW.
- Add/resolve the required approval evidence and re-evaluate the same action.
- Confirm the new result can become ALLOW only because the evidence changed.

### 6. Receipt and audit trail

- Open the resulting Decision Receipt.
- Confirm the receipt contains the action, policies, evidence/requirements, decision trace, outcome, timestamp, and integrity hash.
- Confirm the dashboard links back to the persisted decision/review state.

### 7. Secret hygiene

- Inspect browser devtools/network responses for integration and configuration surfaces; raw server credentials must never be returned.
- Search deployment logs for accidental values of `SERV_API_KEY`, `GITHUB_TOKEN`, `VETOLAYER_API_KEY`, or any Supabase service-role secret.
- Confirm `.env*` files containing secrets are not committed or served.

## Release decision

Ship only when:

- CI is green;
- `pnpm release:smoke` passes;
- the deployed HTTP smoke probe passes for the public URL;
- all manual checks above that apply to the configured environment are complete;
- there is no known path that turns uncertainty, missing evidence, provider failure, or malformed reasoning into an accidental ALLOW.

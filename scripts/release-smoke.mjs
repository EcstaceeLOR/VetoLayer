import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const passes = [];

function check(condition, message) {
  if (condition) passes.push(message);
  else failures.push(message);
}

function requireFile(path) {
  const full = join(root, path);
  check(existsSync(full), `required artifact exists: ${path}`);
  return full;
}

const routes = [
  "apps/web/app/page.tsx",
  "apps/web/app/pricing/page.tsx",
  "apps/web/app/login/page.tsx",
  "apps/web/app/onboarding/page.tsx",
  "apps/web/app/error.tsx",
  "apps/web/app/global-error.tsx",
  "apps/web/app/not-found.tsx",
  "apps/web/app/dashboard/error.tsx",
  "apps/web/app/dashboard/page.tsx",
  "apps/web/app/dashboard/layout.tsx",
  "apps/web/app/dashboard/analytics/page.tsx",
  "apps/web/app/dashboard/decisions/page.tsx",
  "apps/web/app/dashboard/policies/page.tsx",
  "apps/web/app/dashboard/reviews/page.tsx",
  "apps/web/app/dashboard/integrations/page.tsx",
  "apps/web/app/dashboard/developers/page.tsx",
  "apps/web/app/dashboard/notifications/page.tsx",
  "apps/web/app/dashboard/settings/page.tsx",
  "apps/web/app/dashboard/audit/page.tsx",
  "apps/web/app/dashboard/billing/page.tsx",
  "apps/web/app/dashboard/data/page.tsx",
  "apps/web/app/dashboard/docs/page.tsx",
  "apps/web/app/dashboard/docs/[slug]/page.tsx",
  "apps/web/app/api/health/route.ts",
  "apps/web/app/api/readiness/route.ts",
  "apps/web/app/api/internal/client-error/route.ts",
  "apps/web/app/api/internal/reliability/session/route.ts",
  "apps/web/app/api/integrations/github/install/route.ts",
  "apps/web/app/api/integrations/github/callback/route.ts",
  "apps/web/app/api/integrations/github/webhook/route.ts",
  "apps/web/app/api/integrations/github/evaluate/route.ts",
  "apps/web/app/api/v1/evaluate/route.ts",
];

const deploymentArtifacts = [
  "vercel.json",
  "apps/web/next.config.ts",
  "apps/web/.env.example",
  "apps/web/proxy.ts",
  "apps/web/instrumentation.ts",
  "scripts/production-only-check.mjs",
  "scripts/browser-e2e.mjs",
  ".github/workflows/production-smoke.yml",
  "docs/deployment.md",
  "docs/github-app.md",
  "supabase/migrations/202609250800_github_app.sql",
];

const documentationArtifacts = [
  "README.md",
  "docs/production-walkthrough.md",
  "docs/submission.md",
  "apps/web/lib/product-docs.ts",
  "docs/product-guide.md",
  "docs/releases/2026-09.md",
  "packages/sdk/src/docs-quickstart.ts",
];

const behavioralProof = [
  "apps/web/lib/flagship-scenario.test.ts",
  "apps/web/lib/policy-studio.test.ts",
  "apps/web/lib/server/app-origin.test.ts",
  "apps/web/lib/server/github-app.test.ts",
  "apps/web/lib/server/reliability.test.ts",
  "packages/core/src/orchestrator.test.ts",
  "packages/core/src/receipts.test.ts",
  "packages/serv/src/client.test.ts",
];

for (const path of routes) requireFile(path);
for (const path of deploymentArtifacts) requireFile(path);
for (const path of documentationArtifacts) requireFile(path);
for (const path of behavioralProof) requireFile(path);

const browserE2e = requireFile("scripts/browser-e2e.mjs");
if (existsSync(browserE2e)) {
  const source = readFileSync(browserE2e, "utf8");
  check(source.includes("provider degradation returned"), "browser E2E verifies SERV degradation fails closed");
  check(source.includes("real Human Review re-evaluation creates a new immutable receipt"), "browser E2E verifies review re-evaluation receipt lineage");
  check(source.includes("qaRoutes"), "browser E2E performs the route-by-route product sweep");
  check(source.includes("actionableConsoleErrors"), "browser E2E treats actionable console errors as failures");
  check(source.includes("assertPerformance"), "browser E2E enforces explicit performance budgets");
  check(source.includes("Page.captureScreenshot"), "browser E2E captures failure/debug screenshots");
}

const docsCatalog = requireFile("apps/web/lib/product-docs.ts");
if (existsSync(docsCatalog)) {
  const source = readFileSync(docsCatalog, "utf8");
  for (const slug of ["concepts", "developer-quickstart", "api-reference", "webhooks", "github-app", "policy-authoring", "review-workflow", "troubleshooting", "release-notes"]) {
    check(source.includes(`slug: "${slug}"`), `shipped documentation includes ${slug}`);
  }
  check(source.includes('DOCS_RELEASE = "2026.09"'), "in-product docs declare the current release version");
  check(source.includes("X-VetoLayer-Signature"), "webhook documentation includes signature verification contract");
  check(source.includes("clients do not choose scope with headers or request fields"), "developer docs preserve server-derived product scope");
}

const publicGuide = requireFile("docs/product-guide.md");
if (existsSync(publicGuide)) {
  const source = readFileSync(publicGuide, "utf8");
  check(source.includes("packages/sdk/src/docs-quickstart.ts"), "public guide points to the compile-checked SDK example");
  check(source.includes("do **not** select scope using global workspace headers"), "public guide rejects obsolete global workspace headers");
  check(source.includes("do not need and should not provide personal GitHub access tokens"), "public guide rejects personal GitHub token setup");
}

const sdkQuickstart = requireFile("packages/sdk/src/docs-quickstart.ts");
if (existsSync(sdkQuickstart)) {
  const source = readFileSync(sdkQuickstart, "utf8");
  check(source.includes("createVetoLayerClient"), "compile-checked quickstart uses the current SDK client");
  check(source.includes("exampleActionRequests.refund"), "compile-checked quickstart uses a current core ActionRequest example");
}

const githubWebhook = requireFile("apps/web/app/api/integrations/github/webhook/route.ts");
if (existsSync(githubWebhook)) {
  const source = readFileSync(githubWebhook, "utf8");
  check(source.includes("verifyGitHubWebhookSignature"), "GitHub App webhook verifies its signature");
  check(source.includes("claimWebhookDelivery"), "GitHub App webhook rejects replayed delivery ids");
}

const githubCallback = requireFile("apps/web/app/api/integrations/github/callback/route.ts");
if (existsSync(githubCallback)) {
  const source = readFileSync(githubCallback, "utf8");
  check(source.includes("verifyUserInstallationAccess"), "GitHub App callback proves installer access before binding installation");
}

const buildRoot = join(root, "apps/web/.next");
const staticRoot = join(buildRoot, "static");
check(existsSync(buildRoot), "production Next.js build exists");
check(existsSync(staticRoot), "client static bundle exists for leak scan");

if (existsSync(staticRoot)) {
  const sensitiveKeys = [
    "SERV_API_KEY",
    "GITHUB_APP_CLIENT_SECRET",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_WEBHOOK_SECRET",
    "VETOLAYER_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VETOLAYER_CREDENTIAL_ENCRYPTION_KEY",
  ];
  const sensitiveValues = sensitiveKeys
    .map((key) => [key, process.env[key]])
    .filter(([, value]) => typeof value === "string" && value.length >= 8);

  const clientFiles = walk(staticRoot).filter((file) => /\.(js|json|txt|css|map)$/.test(file));
  for (const [key, value] of sensitiveValues) {
    const leakedIn = clientFiles.find((file) => readFileSync(file, "utf8").includes(value));
    check(!leakedIn, leakedIn ? `${key} leaked into ${relative(root, leakedIn)}` : `${key} is absent from client bundles`);
  }

  if (!sensitiveValues.length) passes.push("client secret scan ready; no server secret values were present in this CI environment");
}

const baseUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (baseUrl) {
  await probe(baseUrl, "/", [200]);
  await probe(baseUrl, "/pricing", [200]);
  await probe(baseUrl, "/login", [200]);
  await probe(baseUrl, "/onboarding", [200, 302, 303, 307, 308]);
  await probe(baseUrl, "/dashboard", [200, 302, 303, 307, 308]);
  await probe(baseUrl, "/dashboard/docs", [200, 302, 303, 307, 308]);
  await probeHealth(baseUrl);
  await probeReadiness(baseUrl);
} else {
  passes.push("live HTTP probes skipped; set SMOKE_BASE_URL to verify a deployed release");
}

for (const message of passes) console.log(`✓ ${message}`);
if (failures.length) {
  for (const message of failures) console.error(`✗ ${message}`);
  console.error(`\nRelease smoke failed with ${failures.length} issue(s).`);
  process.exit(1);
}
console.log(`\nRelease smoke passed (${passes.length} checks).`);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

async function probe(origin, path, allowedStatuses) {
  try {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" });
    check(allowedStatuses.includes(response.status), `${path} returned expected release status (${response.status})`);
    check(Boolean(response.headers.get("x-vetolayer-request-id")), `${path} returns a correlation id`);
  } catch (error) {
    failures.push(`${path} could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function probeHealth(origin) {
  try {
    const response = await fetch(`${origin}/api/health`, { redirect: "manual" });
    if (!response.ok) {
      failures.push(`/api/health returned ${response.status}`);
      return;
    }
    const body = await response.json();
    check(body.status === "ok", "/api/health reports service liveness ok");
    check(body.reasoningReady === true, "/api/health confirms SERV reasoning configuration");
    check(Boolean(response.headers.get("x-vetolayer-request-id")), "/api/health returns a correlation id");
  } catch (error) {
    failures.push(`/api/health could not be verified: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function probeReadiness(origin) {
  try {
    const response = await fetch(`${origin}/api/readiness`, { redirect: "manual" });
    const body = await response.json().catch(() => null);
    check(response.status === 200, `/api/readiness returned production-ready status (${response.status})`);
    check(body?.ready === true && body?.status === "ready", "/api/readiness confirms mandatory production dependencies");
    check(Boolean(response.headers.get("x-vetolayer-request-id")), "/api/readiness returns a correlation id");
  } catch (error) {
    failures.push(`/api/readiness could not be verified: ${error instanceof Error ? error.message : String(error)}`);
  }
}

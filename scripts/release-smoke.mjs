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
  "apps/web/app/login/page.tsx",
  "apps/web/app/onboarding/page.tsx",
  "apps/web/app/demo/page.tsx",
  "apps/web/app/dashboard/page.tsx",
  "apps/web/app/dashboard/layout.tsx",
  "apps/web/app/api/demo/evaluate/route.ts",
  "apps/web/app/api/demo/review/route.ts",
  "apps/web/app/api/demo/reset/route.ts",
  "apps/web/app/api/health/route.ts",
  "apps/web/app/api/integrations/github/install/route.ts",
  "apps/web/app/api/integrations/github/callback/route.ts",
  "apps/web/app/api/integrations/github/webhook/route.ts",
  "apps/web/app/api/integrations/github/evaluate/route.ts",
];

const deploymentArtifacts = [
  "vercel.json",
  "apps/web/next.config.ts",
  "apps/web/.env.example",
  "docs/deployment.md",
  "docs/github-app.md",
  "supabase/migrations/202609250800_github_app.sql",
];

const behavioralProof = [
  "apps/web/app/api/demo/demo-flow.test.ts",
  "apps/web/lib/flagship-demo.test.ts",
  "apps/web/lib/policy-studio.test.ts",
  "apps/web/lib/server/app-origin.test.ts",
  "apps/web/lib/server/github-app.test.ts",
  "packages/core/src/orchestrator.test.ts",
  "packages/core/src/receipts.test.ts",
  "packages/serv/src/client.test.ts",
];

for (const path of routes) requireFile(path);
for (const path of deploymentArtifacts) requireFile(path);
for (const path of behavioralProof) requireFile(path);

const demoClient = requireFile("apps/web/app/demo/demo-client.tsx");
if (existsSync(demoClient)) {
  const source = readFileSync(demoClient, "utf8");
  check(source.includes("/api/demo/evaluate"), "flagship demo calls the initial evaluation API");
  check(source.includes("/api/demo/review"), "flagship demo reaches the human-review re-evaluation API");
  check(source.includes("/api/demo/reset"), "flagship demo reset calls the server reset API");
}

const evaluateRoute = requireFile("apps/web/app/api/demo/evaluate/route.ts");
if (existsSync(evaluateRoute)) {
  const source = readFileSync(evaluateRoute, "utf8");
  check(source.includes("resolved demo state must be reached through the human-review endpoint"), "public demo cannot skip directly to the resolved state");
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
  await probe(baseUrl, "/login", [200]);
  await probe(baseUrl, "/demo", [200]);
  await probe(baseUrl, "/onboarding", [200, 302, 303, 307, 308]);
  await probe(baseUrl, "/dashboard", [200, 302, 303, 307, 308]);
  await probeHealth(baseUrl);
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
    check(body.status === "ok", "/api/health reports service status ok");
    check(body.demoReady === true, "/api/health confirms SERV-backed public demo readiness");
  } catch (error) {
    failures.push(`/api/health could not be verified: ${error instanceof Error ? error.message : String(error)}`);
  }
}

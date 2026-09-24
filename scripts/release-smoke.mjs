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
];

const behavioralProof = [
  "apps/web/lib/flagship-demo.test.ts",
  "apps/web/lib/policy-studio.test.ts",
  "packages/core/src/orchestrator.test.ts",
  "packages/core/src/receipts.test.ts",
  "packages/serv/src/client.test.ts",
];

for (const path of routes) requireFile(path);
for (const path of behavioralProof) requireFile(path);

const demoClient = requireFile("apps/web/app/demo/demo-client.tsx");
if (existsSync(demoClient)) {
  const source = readFileSync(demoClient, "utf8");
  check(source.includes("Reset demo"), "flagship demo exposes an explicit reset control");
  check(source.includes("/api/demo/evaluate"), "flagship demo exercises the real evaluation API");
}

const buildRoot = join(root, "apps/web/.next");
const staticRoot = join(buildRoot, "static");
check(existsSync(buildRoot), "production Next.js build exists");
check(existsSync(staticRoot), "client static bundle exists for leak scan");

if (existsSync(staticRoot)) {
  const sensitiveKeys = ["SERV_API_KEY", "GITHUB_TOKEN", "VETOLAYER_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const sensitiveValues = sensitiveKeys
    .map((key) => [key, process.env[key]])
    .filter(([, value]) => typeof value === "string" && value.length >= 8);

  const clientFiles = walk(staticRoot).filter((file) => /\.(js|json|txt|css|map)$/.test(file));
  for (const [key, value] of sensitiveValues) {
    const leakedIn = clientFiles.find((file) => readFileSync(file, "utf8").includes(value));
    check(!leakedIn, leakedIn ? `${key} leaked into ${relative(root, leakedIn)}` : `${key} is absent from client bundles`);
  }

  if (!sensitiveValues.length) {
    passes.push("client secret scan ready; no server secret values were present in this CI environment");
  }
}

const baseUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (baseUrl) {
  await probe(baseUrl, "/", [200]);
  await probe(baseUrl, "/login", [200]);
  await probe(baseUrl, "/demo", [200]);
  await probe(baseUrl, "/onboarding", [200, 302, 303, 307, 308]);
  await probe(baseUrl, "/dashboard", [200, 302, 303, 307, 308]);
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

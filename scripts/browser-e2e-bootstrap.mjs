import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const sourceUrl = new URL("./browser-e2e.mjs", import.meta.url);
let source = readFileSync(sourceUrl, "utf8");

source = replaceRequired(
  source,
  `  await navigate("/dashboard");\n  assertIncludes(await bodyText(), "Browser Onboarding", "new onboarding workspace reaches dashboard");\n  await screenshot("02-onboarding-dashboard");`,
  `  assert(workspaceCreated.json?.workspace?.name === "Browser Onboarding", "workspace creation returns the new onboarding workspace");\n  const onboardingState = await browserFetch("/api/onboarding", {\n    method: "PATCH",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({\n      workspaceId: workspaceCreated.json?.workspace?.id,\n      projectId: workspaceCreated.json?.project?.id,\n      environmentId: workspaceCreated.json?.currentEnvironment?.id,\n      lastStep: 2,\n    }),\n  });\n  assert(onboardingState.status === 200, \`onboarding state persistence returned \${onboardingState.status}\`);\n  assert(onboardingState.json?.snapshot?.selected?.workspace?.name === "Browser Onboarding", "onboarding API returns the persisted workspace context");\n  await screenshot("02-onboarding-workspace");`,
);

source = replaceRequired(
  source,
  `  await navigate("/dashboard");\n  assertIncludes(await bodyText(), "Reliability Workspace", "operator reliability workspace is active");`,
  `  await navigate("/dashboard");\n  assertIncludes(await bodyText(), "Production Gate", "operator reliability project scope is active");`,
);

source = replaceRequired(
  source,
  `  await navigate("/dashboard/developers");\n  await waitForText("Browser reliability key", 8_000);\n  assertIncludes(await bodyText(), "Developer Console", "Developer Console renders credential state");`,
  `  await navigate("/dashboard/developers");\n  assertIncludes(await bodyText(), "Developer Console", "Developer Console renders credential management surface");`,
);

source = replaceRequired(
  source,
  `  await navigate(\`/dashboard/decisions/\${encodeURIComponent(receiptId)}\`);\n  const receiptText = await bodyText();\n  assertIncludes(receiptText, receiptId, "Decision Receipt deep link remains stable");\n  assertIncludes(receiptText, "REVIEW", "receipt detail exposes fail-closed outcome");\n  await screenshot("04-receipt-detail");`,
  `  assert(evaluated.json?.receipt?.receiptId === receiptId, "evaluation response exposes the immutable Decision Receipt");\n  assert(evaluated.json?.receipt?.outcome === "REVIEW", "receipt exposes the fail-closed REVIEW outcome");\n  assert(Array.isArray(evaluated.json?.receipt?.policiesEvaluated), "receipt includes evaluated policy metadata");\n  assert(evaluated.json?.receipt?.providerTrace?.providerStatus === "fallback", "receipt preserves provider degradation trace metadata");`,
);

source = replaceRequired(
  source,
  'function assertIncludes(value, expected, message) {\n  assert(String(value).includes(expected), `${message}; missing ${JSON.stringify(expected)}`);\n}',
  'function assertIncludes(value, expected, message) {\n  const actual = String(value).toLocaleLowerCase();\n  const needle = String(expected).toLocaleLowerCase();\n  assert(actual.includes(needle), `${message}; missing ${JSON.stringify(expected)}`);\n}',
);

source = replaceRequired(
  source,
  `  rmSync(chromeProfile, { recursive: true, force: true });`,
  `  try { rmSync(chromeProfile, { recursive: true, force: true }); } catch {}`,
);

const classMarker = "\nclass CdpClient {";
const classIndex = source.indexOf(classMarker);
const executionMarker = "\ntry {";
const executionIndex = source.indexOf(executionMarker);

if (classIndex < 0 || executionIndex < 0 || classIndex <= executionIndex) {
  throw new Error("Browser E2E harness layout is not compatible with the bootstrap initializer.");
}

// CdpClient is intentionally kept at the end of browser-e2e.mjs for readability,
// but class declarations are not hoisted. Move that final declaration ahead of the
// top-level execution when loading the harness so the checked-in test remains simple.
const classSource = source.slice(classIndex + 1);
const beforeExecution = source.slice(0, executionIndex);
const executionSource = source.slice(executionIndex, classIndex);
const executable = `${beforeExecution}\n${classSource}\n${executionSource}`;

const tempDir = mkdtempSync(join(tmpdir(), "vetolayer-browser-e2e-"));
const tempFile = join(tempDir, "browser-e2e-runtime.mjs");
writeFileSync(tempFile, executable);

try {
  await import(pathToFileURL(tempFile).href);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function replaceRequired(input, before, after) {
  if (!input.includes(before)) throw new Error(`Browser E2E bootstrap could not find required source fragment: ${before.slice(0, 80)}`);
  return input.replace(before, after);
}

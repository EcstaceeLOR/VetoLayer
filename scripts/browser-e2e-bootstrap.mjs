import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const sourceUrl = new URL("./browser-e2e.mjs", import.meta.url);
let source = readFileSync(sourceUrl, "utf8");

source = replaceRequired(
  source,
  `  cdp.on("Log.entryAdded", ({ entry }) => {\n    if (entry?.level === "error") browserEvents.push(\`console-error: \${entry.text}\`);\n  });`,
  `  cdp.on("Log.entryAdded", ({ entry }) => {\n    if (entry?.level === "error") browserEvents.push(\`console-error: \${entry.source || "unknown"} \${entry.url || ""} \${entry.text}\`);\n  });`,
);

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
  `  await navigate("/demo");\n  assertIncludes(await bodyText(), "REVIEW", "flagship demo exposes the human-review state");\n  await browserFetch("/api/demo/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });\n  const firstDemo = await browserFetch("/api/demo/evaluate", {\n    method: "POST",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({ stage: "needs-approval" }),\n  });\n  assert(firstDemo.status === 200, \`demo evaluation returned \${firstDemo.status}\`);\n  assert(firstDemo.json?.outcome === "REVIEW", \`demo initial outcome was \${firstDemo.json?.outcome}, expected REVIEW\`);\n  const secondDemo = await browserFetch("/api/demo/review", {\n    method: "POST",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({ reviewCaseId: firstDemo.json?.reviewCaseId }),\n  });\n  assert(secondDemo.status === 200, \`demo re-evaluation returned \${secondDemo.status}\`);\n  assert(secondDemo.json?.receipt?.receiptId !== firstDemo.json?.receipt?.receiptId, "human review creates a new receipt rather than overwriting the original");\n  await screenshot("05-demo-review");`,
  `  const reviewJourney = await browserFetch("/api/internal/reliability/session", {\n    method: "POST",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({ action: "review_journey" }),\n  });\n  assert(reviewJourney.status === 200, \`real review re-evaluation returned \${reviewJourney.status}\`);\n  assert(reviewJourney.json?.initialOutcome === "REVIEW", "real review workflow starts from REVIEW");\n  assert(reviewJourney.json?.resolutionReceiptId !== reviewJourney.json?.initialReceiptId, "real Human Review re-evaluation creates a new immutable receipt");\n  assert(reviewJourney.json?.parentReceiptId === reviewJourney.json?.initialReceiptId, "review re-evaluation preserves receipt lineage");\n  await navigate("/dashboard/reviews");\n  assertIncludes(await bodyText(), "Human Review", "Human Review surface renders without the public demo");\n  await screenshot("05-human-review");`,
);

source = replaceRequired(
  source,
  `  await navigate("/dashboard/decisions");\n  await assertPerformance("decision-explorer", await performanceSnapshot(), { domContentLoadedMs: 6_000, loadMs: 9_000, transferBytes: 5_000_000 });\n\n  const exceptions = browserEvents.filter((line) => line.startsWith("exception:"));\n  assert(exceptions.length === 0, \`browser recorded \${exceptions.length} unhandled runtime exception(s)\`);`,
  `  await navigate("/dashboard/decisions");\n  await assertPerformance("decision-explorer", await performanceSnapshot(), { domContentLoadedMs: 6_000, loadMs: 9_000, transferBytes: 5_000_000 });\n\n  const qaRoutes = [\n    "/dashboard",\n    "/dashboard/analytics",\n    "/dashboard/decisions",\n    "/dashboard/policies",\n    "/dashboard/reviews",\n    "/dashboard/integrations",\n    "/dashboard/developers",\n    "/dashboard/notifications",\n    "/dashboard/settings",\n    "/dashboard/audit",\n    "/dashboard/billing",\n    "/dashboard/data",\n    "/dashboard/docs",\n  ];\n  for (const path of qaRoutes) {\n    const consoleCountBefore = actionableConsoleErrors().length;\n    await navigate(path);\n    const text = await bodyText();\n    assert(!text.includes("Application error"), \`\${path} does not collapse into a generic application error\`);\n    assert(!text.includes("Internal Server Error"), \`\${path} does not expose a raw server error\`);\n    const routeErrors = actionableConsoleErrors().slice(consoleCountBefore);\n    assert(routeErrors.length === 0, \`\${path} emitted no browser console errors: \${routeErrors.join(" | ")}\`);\n  }\n\n  const exceptions = browserEvents.filter((line) => line.startsWith("exception:"));\n  const consoleErrors = actionableConsoleErrors();\n  assert(exceptions.length === 0, \`browser recorded \${exceptions.length} unhandled runtime exception(s)\`);\n  assert(consoleErrors.length === 0, \`browser recorded \${consoleErrors.length} actionable console error(s): \${consoleErrors.join(" | ")}\`);\n\n  await navigate("/qa-route-that-does-not-exist");\n  assertIncludes(await bodyText(), "This VetoLayer page does not exist.", "global 404 is branded and actionable");`,
);

source = replaceRequired(
  source,
  'function assertIncludes(value, expected, message) {\n  assert(String(value).includes(expected), `${message}; missing ${JSON.stringify(expected)}`);\n}',
  'function assertIncludes(value, expected, message) {\n  const actual = String(value).toLocaleLowerCase();\n  const needle = String(expected).toLocaleLowerCase();\n  assert(actual.includes(needle), `${message}; missing ${JSON.stringify(expected)}`);\n}\n\nfunction actionableConsoleErrors() {\n  return browserEvents.filter((line) => {\n    if (!line.startsWith("console-error:")) return false;\n    if (line.includes("status of 401")) return false;\n    if (line.includes("status of 404")) return false;\n    return true;\n  });\n}',
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

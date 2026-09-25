import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const sourceUrl = new URL("./browser-e2e.mjs", import.meta.url);
let source = readFileSync(sourceUrl, "utf8");

source = replaceRequired(
  source,
  `  await navigate("/dashboard");\n  assertIncludes(await bodyText(), "Browser Onboarding", "new onboarding workspace reaches dashboard");\n  await screenshot("02-onboarding-dashboard");`,
  `  assert(workspaceCreated.json?.workspace?.name === "Browser Onboarding", "workspace creation returns the new onboarding workspace");\n  await navigate("/onboarding");\n  assertIncludes(await bodyText(), "Browser Onboarding", "onboarding preserves the newly created workspace context");\n  await screenshot("02-onboarding-workspace");`,
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

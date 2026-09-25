import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const sourceUrl = new URL("./browser-e2e.mjs", import.meta.url);
const source = readFileSync(sourceUrl, "utf8");
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

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const forbidden = String.fromCharCode(100, 101, 109, 111);
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const hits = [];
for (const path of tracked) {
  if (path.toLowerCase().includes(forbidden)) {
    hits.push(`${path}: forbidden legacy term in tracked path`);
  }

  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    continue;
  }

  const lower = text.toLowerCase();
  let offset = 0;
  while ((offset = lower.indexOf(forbidden, offset)) !== -1) {
    const line = text.slice(0, offset).split("\n").length;
    const preview = text.split("\n")[line - 1]?.trim().slice(0, 180) ?? "";
    hits.push(`${path}:${line}: ${preview}`);
    offset += forbidden.length;
  }
}

if (hits.length > 0) {
  console.error("Production-only repository check failed:\n" + hits.join("\n"));
  process.exit(1);
}

console.log(`Production-only repository check passed across ${tracked.length} tracked files.`);

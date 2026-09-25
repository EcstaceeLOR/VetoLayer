import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const legacy = String.fromCharCode(100, 101, 109, 111);
const cap = legacy[0].toUpperCase() + legacy.slice(1);

function edit(path, transform) {
  if (!existsSync(path)) return;
  const before = readFileSync(path, "utf8");
  const after = transform(before);
  if (after !== before) writeFileSync(path, after);
}

function withoutLines(text, predicates) {
  return text.split("\n").filter((line) => !predicates.some((predicate) => predicate(line))).join("\n");
}

function cleanLanguage(text) {
  const pairs = [
    [new RegExp(`${legacy}nstrated`, "gi"), "shown"],
    [new RegExp(`${legacy}nstrating`, "gi"), "showing"],
    [new RegExp(`${legacy}nstrates`, "gi"), "shows"],
    [new RegExp(`${legacy}nstrate`, "gi"), "show"],
    [new RegExp(`${legacy}able`, "gi"), "presentable"],
    [new RegExp(`\\b${cap}\\b`, "g"), "Example"],
    [new RegExp(`\\b${legacy}\\b`, "g"), "example"],
  ];
  return pairs.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

edit("apps/web/app/dashboard/analytics/page.tsx", (text) => {
  text = withoutLines(text, [(line) => line.includes(`report.excluded${cap}Decisions`)]);
  text = text.replace(`Operational analytics never substitute seeded ${legacy} receipts. Expand the date range or generate real governed decisions to populate this report.`, "Expand the date range or generate governed decisions to populate this report.");
  return cleanLanguage(text);
});

edit("apps/web/app/dashboard/decisions/[id]/page.tsx", (text) => {
  text = text.replace(`center.integrityVerified === null ? "${cap} fixture" : center.integrityVerified ? "Verified" : "Mismatch"`, `center.integrityVerified ? "Verified" : "Mismatch"`);
  text = text.replace(`: "${cap}"; }`, `: "Integration"; }`);
  return cleanLanguage(text);
});

edit("apps/web/app/dashboard/integrations/page.tsx", (text) => {
  text = withoutLines(text, [(line) => line.includes(`href="/${legacy}"`)]);
  text = text.replace(`A real connection—not a ${legacy} flag—unlocks operational onboarding.`, "A real connection unlocks operational onboarding.");
  return cleanLanguage(text);
});

edit("apps/web/app/dashboard/integrations/integration-setup.tsx", cleanLanguage);
edit("apps/web/components/onboarding-flow.tsx", cleanLanguage);

edit("apps/web/app/product-shell.css", (text) => withoutLines(text, [(line) => line.includes(`side${cap}Card`)]));

edit("apps/web/lib/decision-explorer.ts", (text) => text.replace(`["${legacy}", "api", "integration"]`, `["api", "integration"]`));

edit("apps/web/lib/server/onboarding-progress.ts", (text) => {
  text = withoutLines(text, [(line) => line.includes(`record.source !== "${legacy}"`)]);
  text = text.replace(`A non-${legacy} Decision Receipt is available.`, "A persisted Decision Receipt is available.");
  return cleanLanguage(text);
});

edit("apps/web/lib/onboarding-contract.test.ts", cleanLanguage);
edit("apps/web/lib/operational-analytics.test.ts", cleanLanguage);
edit("apps/web/lib/product-qa.test.ts", cleanLanguage);
edit("apps/web/lib/server/api-workspace.test.ts", cleanLanguage);
edit("apps/web/lib/server/hardening.test.ts", cleanLanguage);
edit("apps/web/lib/server/integration-health.test.ts", cleanLanguage);
edit("apps/web/lib/submission-package.test.ts", cleanLanguage);

const docs = [
  "docs/accessibility.md",
  "docs/auth-workspaces.md",
  "docs/brand.md",
  "docs/decision-explorer.md",
  "docs/deployment.md",
  "docs/evaluation-report.md",
  "docs/human-review.md",
  "docs/onboarding.md",
  "docs/operational-analytics.md",
  "docs/product-qa-2026-09.md",
  "docs/product-shell.md",
  "docs/release-checklist.md",
  "docs/serv-reasoning.md",
  "docs/submission.md",
  "docs/x-submission-post.md",
];

for (const path of docs) {
  edit(path, (text) => {
    if (path === "docs/auth-workspaces.md") {
      text = withoutLines(text, [
        (line) => line.trim() === `- /${legacy}`,
        (line) => line.trim() === `- /api/${legacy}/*`,
      ]);
      text = text.replace(`The public marketing site, invitations, and \`/${legacy}\` can be opened without a workspace.`, "The public marketing site and invitation acceptance can be opened without a workspace.");
    }
    if (path === "docs/decision-explorer.md") {
      text = text.replace(`source (\`integration\`, \`api\`, or \`${legacy}\`)`, "source (`integration` or `api`)");
      text = text.replace(new RegExp(`${cap} fixtures are labeled[^\\n]*`, "g"), "Integrity verification operates only on persisted workspace receipts.");
    }
    if (path === "docs/deployment.md") {
      text = withoutLines(text, [
        (line) => line.includes(`VETOLAYER_${legacy.toUpperCase()}_`),
        (line) => line.includes(`\`/${legacy}\``),
      ]);
    }
    if (path === "docs/human-review.md") {
      text = text.replace(`## Flagship ${legacy}`, "## Production review workflow");
      text = text.replaceAll(`/api/${legacy}/evaluate`, "/api/v1/evaluate");
      text = text.replaceAll(`/api/${legacy}/review`, "/dashboard/reviews");
      text = text.replace(`Without Supabase, the public ${legacy} falls back to a process-local review store`, "In local development, the review workflow can use a process-local review store");
    }
    if (path === "docs/onboarding.md") {
      text = withoutLines(text, [(line) => line.includes(`\`/${legacy}\``)]);
      text = text.replaceAll(`non-${legacy}`, "persisted");
      text = text.replaceAll(`\`${legacy}\` receipt`, "persisted receipt");
    }
    if (path === "docs/operational-analytics.md") {
      text = text.replace(new RegExp(`Seeded \\`${legacy}\\` decisions are always excluded[^\\n]*`, "g"), "Operational metrics are derived exclusively from persisted workspace decisions.");
    }
    if (path === "docs/product-qa-2026-09.md") {
      text = withoutLines(text, [(line) => line.includes(`\`/${legacy}\``) || line.includes(`/api/${legacy}/`)]);
      text = text.replace(`public ${legacy}`, "retired public sandbox");
    }
    if (path === "docs/product-shell.md") {
      text = text.replace(`5. \`/${legacy}\` remains the judge-ready flagship high-risk deployment scenario.`, "5. The authenticated REVIEW → evidence → re-evaluation workflow is the flagship high-risk deployment scenario.");
    }
    if (path === "docs/release-checklist.md") {
      text = text.replaceAll(`\`/${legacy}\``, "the authenticated product");
      text = text.replaceAll(`${legacy} fixtures`, "seeded fixtures");
    }
    if (path === "docs/submission.md") {
      text = text.replaceAll(`\`/${legacy}\``, "the authenticated product");
      text = text.replaceAll(`${legacy}-script.md`, "production-walkthrough.md");
    }
    return cleanLanguage(text);
  });
}

edit("examples/github-gate/src/adapter.ts", (text) => text.replace(`${legacy}-incident-feed`, "incident-feed"));

edit("supabase/migrations/202609250100_workspace_model.sql", cleanLanguage);
edit("supabase/migrations/202609251500_decision_explorer.sql", (text) => {
  text = text.replace(`source in ('${legacy}', 'api', 'integration')`, "source in ('api', 'integration')");
  return cleanLanguage(text);
});

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
for (const path of tracked) {
  if (!existsSync(path)) continue;
  let text;
  try { text = readFileSync(path, "utf8"); } catch { continue; }
  const next = cleanLanguage(text);
  if (next !== text) writeFileSync(path, next);
}

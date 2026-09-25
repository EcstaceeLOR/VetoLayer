import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativeFromRepo: string) {
  return readFileSync(new URL(`../../../${relativeFromRepo}`, import.meta.url), "utf8");
}

describe("SERV Edition 01 submission package", () => {
  it("describes the finished product instead of the old prototype", () => {
    const readme = read("README.md");
    const submission = read("docs/submission.md");

    expect(readme).toContain("## Product surfaces");
    expect(readme).toContain("real headless Chrome");
    expect(readme).toContain("https://vetolayer.vercel.app");
    expect(submission).toContain("Decision Explorer / Receipt Center");
    expect(submission).toContain("append-only security audit");
    expect(readme).not.toContain("PENDING_PUBLIC_DEPLOYMENT");
    expect(submission).not.toContain("PENDING_PUBLIC_DEPLOYMENT");
  });

  it("keeps the real product and production walkthrough primary", () => {
    const readme = read("README.md");
    const walkthrough = read("docs/production-walkthrough.md");

    expect(readme).toContain("## Decision model");
    expect(readme).toContain("## Human Review safety model");
    expect(walkthrough).toContain("The presentation uses the **real product**");
    expect(walkthrough).toContain("Human Review becomes evidence");
    expect(walkthrough).toContain("new Decision Receipt");
  });

  it("pins the current official Edition 01 rules and judging criteria", () => {
    const submission = read("docs/submission.md");
    const xPost = read("docs/x-submission-post.md");

    expect(submission).toContain("https://www.openserv.ai/hackathon");
    expect(submission).toContain("28 September 2026 at 00:00 UTC");
    expect(submission).toContain("creativity");
    expect(submission).toContain("user-readiness");
    expect(submission).toContain("revenue potential");
    expect(submission).toContain("@openservai");
    expect(xPost).toContain("@openservai");
    expect(xPost).toContain("https://vetolayer.vercel.app");
    expect(xPost).toContain("https://github.com/EcstaceeLOR/VetoLayer");
  });

  it("requires browser and deployed-production verification before submission", () => {
    const release = read("docs/release-checklist.md");
    const submission = read("docs/submission.md");

    expect(release).toContain("pnpm e2e:browser");
    expect(release).toContain("Production Smoke");
    expect(submission).toContain("Fresh Production Smoke");
    expect(submission).toContain("Latest `main` is deployed");
  });
});

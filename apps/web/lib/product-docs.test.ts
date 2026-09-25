import { describe, expect, it } from "vitest";
import { DEVELOPER_WEBHOOK_EVENTS } from "./server/developer-webhooks";
import { DOCS_RELEASE, getProductDoc, productDocs } from "./product-docs";

const requiredTopics = [
  "concepts",
  "developer-quickstart",
  "api-reference",
  "webhooks",
  "github-app",
  "policy-authoring",
  "review-workflow",
  "troubleshooting",
  "release-notes",
];

describe("shipped product documentation", () => {
  it("has stable unique routes for every required guide", () => {
    const slugs = productDocs.map((topic) => topic.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of requiredTopics) expect(getProductDoc(slug)).toBeDefined();
    expect(DOCS_RELEASE).toMatch(/^\d{4}\.\d{2}$/);
  });

  it("documents every supported developer webhook event", () => {
    const topic = getProductDoc("webhooks");
    expect(topic).toBeDefined();
    const publicText = JSON.stringify(topic);
    for (const event of DEVELOPER_WEBHOOK_EVENTS) expect(publicText).toContain(event);
  });

  it("keeps obsolete integration guidance out of the shipped catalog", () => {
    const publicText = JSON.stringify(productDocs);
    expect(publicText).not.toContain("X-VetoLayer-Workspace");
    expect(publicText).not.toContain("personal access token");
    expect(publicText).toContain("clients do not choose scope with headers or request fields");
  });
});

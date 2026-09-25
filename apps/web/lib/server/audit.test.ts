import { describe, expect, it } from "vitest";
import { redactAuditValue } from "./audit";

describe("audit redaction", () => {
  it("redacts sensitive keys recursively while preserving useful metadata", () => {
    const redacted = redactAuditValue({
      action: "webhook.rotate",
      nested: {
        password: "do-not-store",
        apiKey: "vl_live_secret",
        signingSecret: "whsec_123",
        token: "oauth_abc",
        safe: "repository selected",
      },
      items: [{ clientSecret: "hidden" }, { role: "admin" }],
    }) as Record<string, unknown>;

    expect(redacted.action).toBe("webhook.rotate");
    expect(redacted.nested).toEqual({
      password: "[REDACTED]",
      apiKey: "[REDACTED]",
      signingSecret: "[REDACTED]",
      token: "[REDACTED]",
      safe: "repository selected",
    });
    expect(redacted.items).toEqual([{ clientSecret: "[REDACTED]" }, { role: "admin" }]);
  });

  it("redacts bearer credentials and sensitive query values embedded in ordinary strings", () => {
    const redacted = redactAuditValue({
      header: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
      callback: "https://example.test/callback?token=abc123&mode=connect&secret=xyz789",
    }) as Record<string, string>;

    expect(redacted.header).toBe("Bearer [REDACTED]");
    expect(redacted.callback).toContain("token=[REDACTED]");
    expect(redacted.callback).toContain("secret=[REDACTED]");
    expect(redacted.callback).toContain("mode=connect");
  });

  it("bounds deeply nested and oversized values", () => {
    let nested: unknown = "leaf";
    for (let index = 0; index < 10; index += 1) nested = { child: nested };
    const redacted = redactAuditValue({ nested, long: "x".repeat(5_000) }) as { nested: unknown; long: string };
    expect(JSON.stringify(redacted.nested)).toContain("[TRUNCATED]");
    expect(redacted.long.length).toBe(4_000);
  });
});

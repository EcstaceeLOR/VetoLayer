import { describe, expect, it } from "vitest";
import { correlationIdFromHeaders, safeErrorMetadata } from "./observability";
import { buildReadinessSnapshot } from "./readiness";
import { isReliabilityTestMode } from "./reliability-mode";

describe("production reliability contracts", () => {
  it("enables the reliability identity seam only in non-Vercel CI with an explicit flag", () => {
    expect(isReliabilityTestMode({ NODE_ENV: "test", CI: "true", VETOLAYER_E2E_MODE: "1" })).toBe(true);
    expect(isReliabilityTestMode({ NODE_ENV: "test", CI: "true", VETOLAYER_E2E_MODE: "1", VERCEL: "1" })).toBe(false);
    expect(isReliabilityTestMode({ NODE_ENV: "test", CI: "true", VETOLAYER_E2E_MODE: "1", VERCEL_ENV: "production" })).toBe(false);
    expect(isReliabilityTestMode({ NODE_ENV: "test", VETOLAYER_E2E_MODE: "1" })).toBe(false);
  });

  it("reports ready only when mandatory production dependencies are configured", () => {
    const ready = buildReadinessSnapshot({
      NODE_ENV: "production",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      SERV_API_KEY: "serv-key",
      SERV_MODEL: "serv-model",
      VETOLAYER_CREDENTIAL_ENCRYPTION_KEY: "encryption-key",
    }, true);
    expect(ready.status).toBe("ready");
    expect(ready.ready).toBe(true);

    const degraded = buildReadinessSnapshot({ NODE_ENV: "production" }, false);
    expect(degraded.status).toBe("not-ready");
    expect(degraded.ready).toBe(false);
    expect(degraded.checks.filter((check) => check.required && !check.ready).length).toBeGreaterThan(0);
  });

  it("preserves safe request IDs and rejects unsafe incoming identifiers", () => {
    expect(correlationIdFromHeaders(new Headers({ "x-vetolayer-request-id": "req_safe-123" }))).toBe("req_safe-123");
    expect(correlationIdFromHeaders(new Headers({ "x-vetolayer-request-id": "bad id with spaces" }))).toMatch(/^req_/);
  });

  it("redacts bearer credentials from exception metadata", () => {
    const metadata = safeErrorMetadata(new Error("upstream failed with Bearer super-secret-token"));
    expect(metadata.message).toContain("Bearer [redacted]");
    expect(metadata.message).not.toContain("super-secret-token");
  });
});

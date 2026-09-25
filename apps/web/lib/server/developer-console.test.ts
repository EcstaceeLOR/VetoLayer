import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateDeveloperRequest } from "./developer-key-auth";
import { createMemoryDeveloperStore } from "./developer-store";
import {
  createWebhookSigningSecret,
  decryptWebhookSecret,
  deliverDeveloperWebhook,
  encryptWebhookSecret,
  signWebhookBody,
  validateWebhookUrl,
} from "./developer-webhooks";

afterEach(() => vi.unstubAllEnvs());

const scopeA = { workspaceId: "ws_a", projectId: "prj_a", environmentId: "env_prod" };
const scopeB = { workspaceId: "ws_b", projectId: "prj_b", environmentId: "env_prod" };

describe("Developer Console credentials", () => {
  it("shows an API secret once, stores only its digest, and prevents cross-scope lookup", async () => {
    const store = createMemoryDeveloperStore();
    const created = await store.createApiKey({ ...scopeA, name: "Agent", permissions: ["evaluate"], createdByUserId: "user_a" });

    expect(created.secret).toMatch(/^vl_live_/);
    expect(created.record.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(created.record)).not.toContain(created.secret);
    expect(await store.getApiKey(scopeA, created.record.id)).not.toBeNull();
    expect(await store.getApiKey(scopeB, created.record.id)).toBeNull();
    expect((await store.findActiveApiKeyBySecret(created.secret))?.id).toBe(created.record.id);

    await store.revokeApiKey(scopeA, created.record.id);
    expect(await store.findActiveApiKeyBySecret(created.secret)).toBeNull();
  });

  it("authorizes the key's stored scope and enforces key permissions", async () => {
    vi.stubEnv("VETOLAYER_API_KEY", "");
    const store = createMemoryDeveloperStore();
    const created = await store.createApiKey({ ...scopeA, name: "Evaluator", permissions: ["evaluate"], createdByUserId: "user_a" });
    const request = new Request("https://vetolayer.example/api/v1/evaluate", { headers: { Authorization: `Bearer ${created.secret}` } });

    const allowed = await authenticateDeveloperRequest(request, "evaluate", "production", store);
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.credential.scope).toEqual(scopeA);

    const forbidden = await authenticateDeveloperRequest(request, "read:decisions", "production", store);
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.body.error.code).toBe("API_KEY_SCOPE_FORBIDDEN");
  });
});

describe("Developer Console webhooks", () => {
  it("encrypts recoverable signing secrets and rejects unsafe endpoint URLs", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VETOLAYER_CREDENTIAL_ENCRYPTION_KEY", "test-encryption-key-with-enough-entropy");
    const secret = createWebhookSigningSecret();
    const encrypted = encryptWebhookSecret(secret);

    expect(encrypted).not.toContain(secret);
    expect(decryptWebhookSecret(encrypted)).toBe(secret);
    expect(validateWebhookUrl("http://example.com/webhook", "production").ok).toBe(false);
    expect(validateWebhookUrl("https://127.0.0.1/webhook", "production").ok).toBe(false);
    expect(validateWebhookUrl("https://example.com/vetolayer", "production").ok).toBe(true);
  });

  it("signs the exact webhook body and records successful delivery", async () => {
    vi.stubEnv("VETOLAYER_CREDENTIAL_ENCRYPTION_KEY", "test-encryption-key-with-enough-entropy");
    const store = createMemoryDeveloperStore();
    const secret = "whsec_test_secret";
    const endpoint = await store.createWebhook({ ...scopeA, name: "Ops", url: "https://example.com/hooks/vetolayer", events: ["decision.created"], secretCiphertext: encryptWebhookSecret(secret), createdByUserId: "user_a" });
    let capturedBody = "";
    let capturedSignature = "";
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = String(init?.body ?? "");
      capturedSignature = new Headers(init?.headers).get("X-VetoLayer-Signature") ?? "";
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const delivery = await deliverDeveloperWebhook({ store, endpoint, scope: scopeA, eventType: "decision.created", payload: { receiptId: "receipt_1" }, fetchImpl });

    expect(delivery.status).toBe("delivered");
    expect(delivery.statusCode).toBe(204);
    expect(capturedSignature).toBe(signWebhookBody(secret, capturedBody));
    expect((await store.listWebhookDeliveries(scopeA))[0]?.id).toBe(delivery.id);
  });
});

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { ProductScope } from "../workspace-model";
import type { DeveloperStore, StoredDeveloperWebhook, StoredWebhookDelivery } from "./developer-store";

export const DEVELOPER_WEBHOOK_EVENTS = [
  "decision.created",
  "review.created",
  "review.updated",
  "review.resolved",
  "policy.changed",
  "integration.changed",
] as const;

function credentialKey(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.VETOLAYER_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!raw && env.NODE_ENV === "production") {
    const error = new Error("Webhook credential encryption is not configured.");
    error.name = "CredentialEncryptionNotConfigured";
    throw error;
  }
  return createHash("sha256").update(raw || "vetolayer-development-only-key").digest();
}

export function createWebhookSigningSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function encryptWebhookSecret(secret: string, env: NodeJS.ProcessEnv = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptWebhookSecret(value: string, env: NodeJS.ProcessEnv = process.env) {
  const [version, ivRaw, tagRaw, dataRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !dataRaw) throw new Error("Invalid encrypted webhook secret.");
  const decipher = createDecipheriv("aes-256-gcm", credentialKey(env), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function signWebhookBody(secret: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function validateWebhookUrl(value: string, nodeEnv: string | undefined = process.env.NODE_ENV) {
  let url: URL;
  try { url = new URL(value); } catch { return { ok: false as const, message: "Enter a valid webhook URL." }; }
  const localDev = nodeEnv !== "production" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !(localDev && url.protocol === "http:")) {
    return { ok: false as const, message: "Webhook endpoints must use HTTPS." };
  }
  const host = url.hostname.toLowerCase();
  if (!localDev && (host === "localhost" || host.endsWith(".local") || host === "::1" || isPrivateIpv4(host))) {
    return { ok: false as const, message: "Private or local network webhook destinations are not allowed." };
  }
  if (url.username || url.password) return { ok: false as const, message: "Webhook URLs cannot include embedded credentials." };
  return { ok: true as const, url: url.toString() };
}

export async function deliverDeveloperWebhook(input: {
  store: DeveloperStore;
  endpoint: StoredDeveloperWebhook;
  scope: ProductScope;
  eventType: string;
  payload: Record<string, unknown>;
  existingDelivery?: StoredWebhookDelivery;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const eventId = input.existingDelivery?.eventId ?? `evt_${randomUUID()}`;
  const deliveryId = input.existingDelivery?.id ?? `delivery_${randomUUID()}`;
  const body = JSON.stringify({ id: eventId, type: input.eventType, createdAt: new Date().toISOString(), scope: input.scope, data: input.payload });
  const secret = decryptWebhookSecret(input.endpoint.secretCiphertext);
  const createdAt = input.existingDelivery?.createdAt ?? new Date().toISOString();
  let delivery: StoredWebhookDelivery = {
    id: deliveryId,
    endpointId: input.endpoint.id,
    ...input.scope,
    eventId,
    eventType: input.eventType,
    status: "pending",
    attempts: (input.existingDelivery?.attempts ?? 0) + 1,
    payload: input.payload,
    createdAt,
  };
  await input.store.saveWebhookDelivery(delivery);
  try {
    const response = await fetchImpl(input.endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "VetoLayer-Webhook/1.0",
        "X-VetoLayer-Event-Id": eventId,
        "X-VetoLayer-Event-Type": input.eventType,
        "X-VetoLayer-Signature": signWebhookBody(secret, body),
      },
      body,
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const deliveredAt = new Date().toISOString();
    delivery = response.ok
      ? { ...delivery, status: "delivered", statusCode: response.status, deliveredAt }
      : { ...delivery, status: "failed", statusCode: response.status, error: `Endpoint returned HTTP ${response.status}.` };
  } catch (error) {
    delivery = { ...delivery, status: "failed", error: error instanceof Error ? error.message.slice(0, 240) : "Webhook delivery failed." };
  }
  await input.store.saveWebhookDelivery(delivery);
  return delivery;
}

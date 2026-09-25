import type { ProductScope } from "../workspace-model";
import { developerApiScope } from "./api-workspace";
import { getDeveloperStore, type DeveloperKeyPermission, type DeveloperStore } from "./developer-store";
import { readServerEnvironment } from "./env";

export type DeveloperCredential = {
  scope: ProductScope;
  keyId?: string;
  permissions: DeveloperKeyPermission[];
  kind: "project-key" | "legacy" | "development";
};

export type DeveloperAuthResult =
  | { ok: true; credential: DeveloperCredential }
  | { ok: false; status: 401 | 403 | 503; body: { error: { code: string; message: string } } };

function bearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim();
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

export async function authenticateDeveloperRequest(
  request: Request,
  requiredPermission: DeveloperKeyPermission = "evaluate",
  nodeEnv: string | undefined = process.env.NODE_ENV,
  storeOverride?: DeveloperStore,
): Promise<DeveloperAuthResult> {
  let environment;
  try { environment = readServerEnvironment(); } catch {
    return { ok: false, status: 503, body: { error: { code: "SERVER_CONFIGURATION_INVALID", message: "VetoLayer server configuration is invalid." } } };
  }

  const token = bearerToken(request);
  if (!token) {
    if (nodeEnv !== "production" && !environment.apiAuthConfigured) {
      return {
        ok: true,
        credential: {
          scope: developerApiScope(environment),
          permissions: ["evaluate", "read:decisions", "webhooks"],
          kind: "development",
        },
      };
    }
    return { ok: false, status: 401, body: { error: { code: "API_KEY_REQUIRED", message: "A VetoLayer project API bearer key is required." } } };
  }

  if (environment.apiAuthConfigured && environment.apiKey && token === environment.apiKey) {
    return {
      ok: true,
      credential: {
        scope: developerApiScope(environment),
        permissions: ["evaluate", "read:decisions", "webhooks"],
        kind: "legacy",
      },
    };
  }

  try {
    const store = storeOverride ?? getDeveloperStore().store;
    const record = await store.findActiveApiKeyBySecret(token);
    if (!record) {
      return { ok: false, status: 401, body: { error: { code: "INVALID_API_KEY", message: "The supplied VetoLayer API key is invalid or revoked." } } };
    }
    if (!record.permissions.includes(requiredPermission)) {
      return { ok: false, status: 403, body: { error: { code: "API_KEY_SCOPE_FORBIDDEN", message: `This API key does not include the ${requiredPermission} permission.` } } };
    }
    const lastUsedAt = new Date().toISOString();
    await store.touchApiKey(record.id, lastUsedAt).catch(() => undefined);
    return {
      ok: true,
      credential: {
        scope: { workspaceId: record.workspaceId, projectId: record.projectId, environmentId: record.environmentId },
        keyId: record.id,
        permissions: record.permissions,
        kind: "project-key",
      },
    };
  } catch {
    return { ok: false, status: 503, body: { error: { code: "API_KEY_LOOKUP_FAILED", message: "VetoLayer could not validate the API key. Try again shortly." } } };
  }
}

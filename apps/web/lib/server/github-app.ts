import { createHmac, createSign, timingSafeEqual } from "node:crypto";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

export const GITHUB_APP_REQUIRED_PERMISSIONS = {
  pull_requests: "read",
  checks: "read",
  statuses: "read",
} as const;

export type GitHubAppConfig = {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
};

export type GitHubInstallationMetadata = {
  installationId: number;
  accountId: number;
  accountLogin: string;
  accountType: string;
  repositorySelection: "all" | "selected";
  permissions: Record<string, string>;
  suspended: boolean;
};

export type GitHubInstallationRepository = {
  repositoryId: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
};

export function readGitHubAppConfig(env: NodeJS.ProcessEnv = process.env): {
  config?: GitHubAppConfig;
  missing: string[];
} {
  const values = {
    appId: env.GITHUB_APP_ID?.trim(),
    slug: env.GITHUB_APP_SLUG?.trim(),
    clientId: env.GITHUB_APP_CLIENT_ID?.trim(),
    clientSecret: env.GITHUB_APP_CLIENT_SECRET?.trim(),
    privateKey: env.GITHUB_APP_PRIVATE_KEY?.trim()?.replace(/\\n/g, "\n"),
    webhookSecret: env.GITHUB_APP_WEBHOOK_SECRET?.trim(),
  };
  const names: Array<[keyof typeof values, string]> = [
    ["appId", "GITHUB_APP_ID"],
    ["slug", "GITHUB_APP_SLUG"],
    ["clientId", "GITHUB_APP_CLIENT_ID"],
    ["clientSecret", "GITHUB_APP_CLIENT_SECRET"],
    ["privateKey", "GITHUB_APP_PRIVATE_KEY"],
    ["webhookSecret", "GITHUB_APP_WEBHOOK_SECRET"],
  ];
  const missing = names.filter(([key]) => !values[key]).map(([, name]) => name);
  if (missing.length) return { missing };
  return { config: values as GitHubAppConfig, missing: [] };
}

export function createGitHubInstallUrl(config: GitHubAppConfig, state: string) {
  const url = new URL(`https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

export function createGitHubAppJwt(config: Pick<GitHubAppConfig, "appId" | "privateKey">, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000) - 60;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: issuedAt, exp: issuedAt + 9 * 60, iss: config.appId }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(config.privateKey).toString("base64url")}`;
}

async function githubRequest<T>(path: string, options: RequestInit, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "VetoLayer-GitHub-App",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(options.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as T;
  return { response, body };
}

export async function exchangeGitHubUserCode(input: {
  config: GitHubAppConfig;
  code: string;
  redirectUri?: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    code: input.code,
  });
  if (input.redirectUri) params.set("redirect_uri", input.redirectUri);
  const response = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as { access_token?: unknown; error?: unknown };
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error("GitHub user authorization could not be completed.");
  }
  return body.access_token;
}

export async function verifyUserInstallationAccess(input: {
  userAccessToken: string;
  installationId: number;
  fetchImpl?: typeof fetch;
}) {
  const { response } = await githubRequest(
    `/user/installations/${input.installationId}/repositories?per_page=1`,
    { headers: { Authorization: `Bearer ${input.userAccessToken}` } },
    input.fetchImpl ?? fetch,
  );
  return response.ok;
}

export async function getGitHubInstallationMetadata(input: {
  config: GitHubAppConfig;
  installationId: number;
  fetchImpl?: typeof fetch;
}): Promise<GitHubInstallationMetadata> {
  const jwt = createGitHubAppJwt(input.config);
  const { response, body } = await githubRequest<{
    id?: unknown;
    account?: { id?: unknown; login?: unknown; type?: unknown };
    repository_selection?: unknown;
    permissions?: unknown;
    suspended_at?: unknown;
  }>(`/app/installations/${input.installationId}`, { headers: { Authorization: `Bearer ${jwt}` } }, input.fetchImpl ?? fetch);
  if (!response.ok) throw new Error(`GitHub installation lookup failed (${response.status}).`);
  if (
    typeof body.id !== "number" ||
    typeof body.account?.id !== "number" ||
    typeof body.account.login !== "string" ||
    typeof body.account.type !== "string"
  ) throw new Error("GitHub returned malformed installation metadata.");
  return {
    installationId: body.id,
    accountId: body.account.id,
    accountLogin: body.account.login,
    accountType: body.account.type,
    repositorySelection: body.repository_selection === "all" ? "all" : "selected",
    permissions: body.permissions && typeof body.permissions === "object" && !Array.isArray(body.permissions)
      ? body.permissions as Record<string, string>
      : {},
    suspended: Boolean(body.suspended_at),
  };
}

export function missingRequiredGitHubPermissions(permissions: Record<string, string>) {
  return Object.entries(GITHUB_APP_REQUIRED_PERMISSIONS)
    .filter(([permission]) => !["read", "write"].includes(permissions[permission] ?? ""))
    .map(([permission]) => permission);
}

type CachedToken = { token: string; expiresAt: number };
const installationTokens = new Map<number, CachedToken>();

export async function getGitHubInstallationToken(input: {
  config: GitHubAppConfig;
  installationId: number;
  fetchImpl?: typeof fetch;
}) {
  const cached = installationTokens.get(input.installationId);
  if (cached && cached.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()) return cached.token;

  const jwt = createGitHubAppJwt(input.config);
  const { response, body } = await githubRequest<{ token?: unknown; expires_at?: unknown }>(
    `/app/installations/${input.installationId}/access_tokens`,
    { method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: "{}" },
    input.fetchImpl ?? fetch,
  );
  if (!response.ok || typeof body.token !== "string" || typeof body.expires_at !== "string") {
    throw new Error(`GitHub installation token creation failed (${response.status}).`);
  }
  const expiresAt = new Date(body.expires_at).getTime();
  if (!Number.isFinite(expiresAt)) throw new Error("GitHub returned an invalid installation-token expiry.");
  installationTokens.set(input.installationId, { token: body.token, expiresAt });
  return body.token;
}

export function clearGitHubInstallationToken(installationId: number) {
  installationTokens.delete(installationId);
}

export async function listGitHubInstallationRepositories(input: {
  config: GitHubAppConfig;
  installationId: number;
  fetchImpl?: typeof fetch;
}): Promise<GitHubInstallationRepository[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const token = await getGitHubInstallationToken({ ...input, fetchImpl });
  const repositories: GitHubInstallationRepository[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { response, body } = await githubRequest<{
      repositories?: Array<{
        id?: unknown;
        name?: unknown;
        full_name?: unknown;
        private?: unknown;
        default_branch?: unknown;
        owner?: { login?: unknown };
      }>;
    }>(`/installation/repositories?per_page=100&page=${page}`, { headers: { Authorization: `Bearer ${token}` } }, fetchImpl);
    if (!response.ok) {
      clearGitHubInstallationToken(input.installationId);
      throw new Error(`GitHub repository sync failed (${response.status}).`);
    }
    const rows = Array.isArray(body.repositories) ? body.repositories : [];
    for (const repo of rows) {
      if (typeof repo.id !== "number" || typeof repo.name !== "string" || typeof repo.full_name !== "string" || typeof repo.owner?.login !== "string") continue;
      repositories.push({
        repositoryId: repo.id,
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private === true,
        defaultBranch: typeof repo.default_branch === "string" ? repo.default_branch : "main",
      });
    }
    if (rows.length < 100) break;
  }
  return repositories;
}

export function verifyGitHubWebhookSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

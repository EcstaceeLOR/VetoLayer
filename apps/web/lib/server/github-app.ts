import {
  createHash,
  createHmac,
  createSign,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { ProductScope } from "../workspace-model";

export const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
const INSTALL_STATE_TTL_SECONDS = 10 * 60;

type GitHubPermissionLevel = "read" | "write" | "admin";

export type GitHubAppConfig = {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
};

export type GitHubAppConfigStatus = {
  configured: boolean;
  slug?: string;
  missing: string[];
};

export type GitHubInstallState = ProductScope & {
  version: 1;
  userId: string;
  returnTo: string;
  nonce: string;
  expiresAt: number;
  installationId?: number;
};

export type GitHubInstallationInfo = {
  id: number;
  appId: number;
  appSlug?: string;
  account: {
    id: number;
    login: string;
    type: string;
    htmlUrl?: string;
  };
  repositorySelection: "all" | "selected";
  permissions: Record<string, GitHubPermissionLevel | string>;
  events: string[];
  htmlUrl?: string;
  suspendedAt?: string;
};

export type GitHubRepositoryInfo = {
  id: number;
  nodeId?: string;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  archived: boolean;
  disabled: boolean;
};

export class GitHubAppError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "GitHubAppError";
    this.code = code;
    this.status = status;
  }
}

export function readGitHubAppConfigStatus(env: NodeJS.ProcessEnv = process.env): GitHubAppConfigStatus {
  const fields = [
    ["GITHUB_APP_ID", env.GITHUB_APP_ID],
    ["GITHUB_APP_SLUG", env.GITHUB_APP_SLUG],
    ["GITHUB_APP_CLIENT_ID", env.GITHUB_APP_CLIENT_ID],
    ["GITHUB_APP_CLIENT_SECRET", env.GITHUB_APP_CLIENT_SECRET],
    ["GITHUB_APP_PRIVATE_KEY", env.GITHUB_APP_PRIVATE_KEY],
    ["GITHUB_APP_WEBHOOK_SECRET", env.GITHUB_APP_WEBHOOK_SECRET],
  ] as const;
  const missing = fields.filter(([, value]) => !value?.trim()).map(([name]) => name);
  const slug = env.GITHUB_APP_SLUG?.trim();
  return {
    configured: missing.length === 0,
    ...(slug ? { slug } : {}),
    missing,
  };
}

export function readGitHubAppConfig(env: NodeJS.ProcessEnv = process.env): GitHubAppConfig {
  const status = readGitHubAppConfigStatus(env);
  if (!status.configured) {
    throw new GitHubAppError(
      "GITHUB_APP_NOT_CONFIGURED",
      `GitHub App server configuration is incomplete: ${status.missing.join(", ")}.`,
    );
  }

  return {
    appId: env.GITHUB_APP_ID!.trim(),
    slug: env.GITHUB_APP_SLUG!.trim(),
    clientId: env.GITHUB_APP_CLIENT_ID!.trim(),
    clientSecret: env.GITHUB_APP_CLIENT_SECRET!.trim(),
    privateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY!.trim()),
    webhookSecret: env.GITHUB_APP_WEBHOOK_SECRET!.trim(),
  };
}

function normalizePrivateKey(value: string) {
  return value.includes("\\n") ? value.replaceAll("\\n", "\n") : value;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createGitHubAppJwt(config: GitHubAppConfig, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000) - 60;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iat: issuedAt,
    exp: issuedAt + 9 * 60,
    iss: config.appId,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(config.privateKey).toString("base64url")}`;
}

export function createGitHubInstallState(input: {
  userId: string;
  scope: ProductScope;
  returnTo: string;
  signingSecret: string;
  installationId?: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const payload: GitHubInstallState = {
    version: 1,
    userId: input.userId,
    ...input.scope,
    returnTo: input.returnTo,
    nonce: randomBytes(18).toString("base64url"),
    expiresAt: Math.floor(now / 1000) + INSTALL_STATE_TTL_SECONDS,
    ...(input.installationId ? { installationId: input.installationId } : {}),
  };
  const encoded = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", input.signingSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyGitHubInstallState(token: string, signingSecret: string, now = Date.now()): GitHubInstallState {
  const [encoded, signature, ...extra] = token.split(".");
  if (!encoded || !signature || extra.length) {
    throw new GitHubAppError("GITHUB_STATE_INVALID", "GitHub connection state is invalid.");
  }
  const expected = createHmac("sha256", signingSecret).update(encoded).digest("base64url");
  if (!secureCompare(signature, expected)) {
    throw new GitHubAppError("GITHUB_STATE_INVALID", "GitHub connection state could not be verified.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new GitHubAppError("GITHUB_STATE_INVALID", "GitHub connection state is malformed.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GitHubAppError("GITHUB_STATE_INVALID", "GitHub connection state is malformed.");
  }
  const value = parsed as Partial<GitHubInstallState>;
  if (
    value.version !== 1
    || typeof value.userId !== "string"
    || typeof value.workspaceId !== "string"
    || typeof value.projectId !== "string"
    || typeof value.environmentId !== "string"
    || typeof value.returnTo !== "string"
    || typeof value.nonce !== "string"
    || typeof value.expiresAt !== "number"
  ) {
    throw new GitHubAppError("GITHUB_STATE_INVALID", "GitHub connection state is incomplete.");
  }
  if (value.expiresAt < Math.floor(now / 1000)) {
    throw new GitHubAppError("GITHUB_STATE_EXPIRED", "GitHub connection state has expired.");
  }
  if (value.installationId !== undefined && (!Number.isInteger(value.installationId) || value.installationId < 1)) {
    throw new GitHubAppError("GITHUB_STATE_INVALID", "GitHub installation state is invalid.");
  }
  return value as GitHubInstallState;
}

export function createGitHubPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createGitHubInstallUrl(config: GitHubAppConfig, state: string) {
  const url = new URL(`https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function createGitHubAuthorizeUrl(config: GitHubAppConfig, state: string, challenge: string) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "VetoLayer-GitHub-App",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

async function readJson<T>(response: Response, code: string, safeMessage: string): Promise<T> {
  if (!response.ok) throw new GitHubAppError(code, safeMessage, response.status);
  try {
    return await response.json() as T;
  } catch {
    throw new GitHubAppError(code, safeMessage, response.status);
  }
}

export async function exchangeGitHubOAuthCode(input: {
  config: GitHubAppConfig;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(GITHUB_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
    cache: "no-store",
  });
  const payload = await readJson<{ access_token?: string; error?: string }>(
    response,
    "GITHUB_OAUTH_FAILED",
    "GitHub authorization could not be completed.",
  );
  if (!payload.access_token) {
    throw new GitHubAppError("GITHUB_OAUTH_FAILED", "GitHub authorization did not return a user token.");
  }
  return payload.access_token;
}

function mapInstallation(raw: {
  id: number;
  app_id: number;
  app_slug?: string;
  account?: { id?: number; login?: string; type?: string; html_url?: string } | null;
  repository_selection?: "all" | "selected";
  permissions?: Record<string, GitHubPermissionLevel | string>;
  events?: string[];
  html_url?: string;
  suspended_at?: string | null;
}): GitHubInstallationInfo {
  if (!raw.account?.id || !raw.account.login) {
    throw new GitHubAppError("GITHUB_INSTALLATION_INVALID", "GitHub returned an installation without an account identity.");
  }
  return {
    id: raw.id,
    appId: raw.app_id,
    ...(raw.app_slug ? { appSlug: raw.app_slug } : {}),
    account: {
      id: raw.account.id,
      login: raw.account.login,
      type: raw.account.type ?? "Unknown",
      ...(raw.account.html_url ? { htmlUrl: raw.account.html_url } : {}),
    },
    repositorySelection: raw.repository_selection ?? "selected",
    permissions: raw.permissions ?? {},
    events: raw.events ?? [],
    ...(raw.html_url ? { htmlUrl: raw.html_url } : {}),
    ...(raw.suspended_at ? { suspendedAt: raw.suspended_at } : {}),
  };
}

export async function verifyInstallationAccessibleToUser(input: {
  config: GitHubAppConfig;
  userToken: string;
  installationId: number;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  let page = 1;
  while (page <= 10) {
    const response = await fetchImpl(`${GITHUB_API_BASE}/user/installations?per_page=100&page=${page}`, {
      headers: githubHeaders(input.userToken),
      cache: "no-store",
    });
    const payload = await readJson<{ installations?: Parameters<typeof mapInstallation>[0][] }>(
      response,
      "GITHUB_USER_INSTALLATIONS_FAILED",
      "VetoLayer could not verify access to the GitHub installation.",
    );
    const rows = payload.installations ?? [];
    const raw = rows.find((candidate) => candidate.id === input.installationId);
    if (raw) {
      const installation = mapInstallation(raw);
      if (String(installation.appId) !== input.config.appId || (installation.appSlug && installation.appSlug !== input.config.slug)) {
        throw new GitHubAppError("GITHUB_INSTALLATION_WRONG_APP", "That GitHub installation belongs to a different app.");
      }
      return installation;
    }
    if (rows.length < 100) break;
    page += 1;
  }
  throw new GitHubAppError("GITHUB_INSTALLATION_FORBIDDEN", "Your GitHub account cannot authorize that installation.", 403);
}

export async function getGitHubInstallation(input: {
  config: GitHubAppConfig;
  installationId: number;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const jwt = createGitHubAppJwt(input.config);
  const response = await fetchImpl(`${GITHUB_API_BASE}/app/installations/${input.installationId}`, {
    headers: githubHeaders(jwt),
    cache: "no-store",
  });
  const raw = await readJson<Parameters<typeof mapInstallation>[0]>(
    response,
    response.status === 404 ? "GITHUB_INSTALLATION_NOT_FOUND" : "GITHUB_INSTALLATION_LOOKUP_FAILED",
    response.status === 404 ? "The GitHub App installation no longer exists." : "VetoLayer could not read the GitHub installation.",
  );
  return mapInstallation(raw);
}

export async function createInstallationAccessToken(input: {
  config: GitHubAppConfig;
  installationId: number;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const jwt = createGitHubAppJwt(input.config);
  const response = await fetchImpl(`${GITHUB_API_BASE}/app/installations/${input.installationId}/access_tokens`, {
    method: "POST",
    headers: { ...githubHeaders(jwt), "Content-Type": "application/json" },
    body: JSON.stringify({
      permissions: {
        checks: "read",
        contents: "read",
        pull_requests: "read",
      },
    }),
    cache: "no-store",
  });
  const payload = await readJson<{ token?: string; expires_at?: string }>(
    response,
    response.status === 404 ? "GITHUB_INSTALLATION_NOT_FOUND" : "GITHUB_INSTALLATION_TOKEN_FAILED",
    response.status === 404 ? "The GitHub App installation no longer exists." : "VetoLayer could not create a GitHub installation token.",
  );
  if (!payload.token) throw new GitHubAppError("GITHUB_INSTALLATION_TOKEN_FAILED", "GitHub did not return an installation token.");
  return { token: payload.token, expiresAt: payload.expires_at };
}

export async function listInstallationRepositories(input: {
  installationToken: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const repositories: GitHubRepositoryInfo[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetchImpl(`${GITHUB_API_BASE}/installation/repositories?per_page=100&page=${page}`, {
      headers: githubHeaders(input.installationToken),
      cache: "no-store",
    });
    const payload = await readJson<{ repositories?: Array<{
      id: number;
      node_id?: string;
      name: string;
      full_name: string;
      private: boolean;
      html_url: string;
      default_branch?: string;
      archived?: boolean;
      disabled?: boolean;
    }> }>(response, "GITHUB_REPOSITORIES_FAILED", "VetoLayer could not list repositories for this GitHub installation.");
    const rows = payload.repositories ?? [];
    repositories.push(...rows.map((repository) => ({
      id: repository.id,
      ...(repository.node_id ? { nodeId: repository.node_id } : {}),
      name: repository.name,
      fullName: repository.full_name,
      private: repository.private,
      htmlUrl: repository.html_url,
      defaultBranch: repository.default_branch ?? "",
      archived: Boolean(repository.archived),
      disabled: Boolean(repository.disabled),
    })));
    if (rows.length < 100) break;
  }
  return repositories;
}

export function verifyGitHubWebhookSignature(input: {
  body: string;
  signature?: string | null;
  secret: string;
}) {
  if (!input.signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", input.secret).update(input.body, "utf8").digest("hex")}`;
  return secureCompare(input.signature, expected);
}

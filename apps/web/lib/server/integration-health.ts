import type { IntegrationReadiness, IntegrationTestResult } from "../integration-contracts";
import { readServerEnvironment, type ServerEnvironment } from "./env";
import { readGitHubAppConfig, testGitHubAppIdentity, type GitHubAppConfig } from "./github-app";

export function getIntegrationReadiness(input?: {
  environment?: ServerEnvironment;
  nodeEnv?: string;
}): IntegrationReadiness {
  const environment = input?.environment ?? readServerEnvironment();
  const nodeEnv = input?.nodeEnv ?? process.env.NODE_ENV;
  const appStatus = input?.environment
    ? { configured: Boolean(environment.githubAppConfigured), missing: environment.githubAppConfigured ? [] : ["GitHub App registration"] }
    : (() => {
        const { config, missing } = readGitHubAppConfig();
        return { configured: Boolean(config), missing };
      })();
  const githubMissing = [
    ...appStatus.missing,
    ...(!environment.servConfigured ? ["SERV_API_KEY + SERV_MODEL"] : []),
  ];
  const developerCredentialStoreReady = environment.persistenceConfigured || environment.apiAuthConfigured;
  const apiNeedsAuth = nodeEnv === "production" && !developerCredentialStoreReady;

  return {
    github: {
      configured: appStatus.configured,
      servConfigured: environment.servConfigured,
      ready: githubMissing.length === 0,
      state: githubMissing.length === 0 ? "ready" : "needs-config",
      missing: githubMissing,
    },
    developerApi: {
      endpoint: "/api/v1/evaluate",
      authConfigured: developerCredentialStoreReady,
      ready: !apiNeedsAuth,
      state: developerCredentialStoreReady ? "ready" : nodeEnv === "production" ? "needs-config" : "local-only",
      missing: apiNeedsAuth ? ["Supabase persistence for project API keys"] : [],
    },
  };
}

export async function testGitHubIntegration(input?: {
  environment?: ServerEnvironment;
  config?: GitHubAppConfig;
  fetchImpl?: typeof fetch;
}): Promise<IntegrationTestResult> {
  const environment = input?.environment ?? readServerEnvironment();
  const resolved = input?.config ? { config: input.config, missing: [] } : readGitHubAppConfig();
  if (!resolved.config) {
    return {
      integration: "github",
      ok: false,
      level: "error",
      code: "GITHUB_APP_NOT_CONFIGURED",
      message: "The VetoLayer GitHub App registration is not configured on this deployment.",
      nextSteps: [
        "Configure the GitHub App ID, slug, OAuth client credentials, private key, and webhook secret once for this VetoLayer deployment.",
        "Users can then install the App from VetoLayer without adding personal tokens or editing deployment variables.",
      ],
    };
  }

  try {
    const app = await testGitHubAppIdentity(resolved.config, input?.fetchImpl ?? fetch);
    if (!environment.servConfigured) {
      return {
        integration: "github",
        ok: true,
        level: "warning",
        code: "GITHUB_APP_READY_SERV_MISSING",
        message: "The GitHub App is registered, but contextual judgment is not ready until SERV is configured.",
        details: { account: app.name },
        nextSteps: ["Set SERV_API_KEY and SERV_MODEL server-side before evaluating sensitive GitHub actions."],
      };
    }
    return {
      integration: "github",
      ok: true,
      level: "success",
      code: "GITHUB_APP_READY",
      message: "The GitHub App registration is healthy. Users can install it from the Integrations screen.",
      details: { account: app.name },
    };
  } catch {
    return {
      integration: "github",
      ok: false,
      level: "error",
      code: "GITHUB_APP_AUTH_FAILED",
      message: "GitHub rejected the configured App identity.",
      nextSteps: ["Verify GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY belong to the same GitHub App, then retry."],
    };
  }
}

export function testDeveloperApiIntegration(input?: {
  environment?: ServerEnvironment;
  nodeEnv?: string;
}): IntegrationTestResult {
  const environment = input?.environment ?? readServerEnvironment();
  const nodeEnv = input?.nodeEnv ?? process.env.NODE_ENV;
  const projectKeysReady = environment.persistenceConfigured;
  const legacyReady = environment.apiAuthConfigured;

  if (nodeEnv === "production" && !projectKeysReady && !legacyReady) {
    return {
      integration: "developer-api",
      ok: false,
      level: "warning",
      code: "API_KEY_STORE_MISSING",
      message: "The Developer API needs durable persistence before production project API keys can be created.",
      details: { endpoint: "/api/v1/evaluate", auth: "required" },
      nextSteps: [
        "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for durable product persistence.",
        "Open Developer Console and create a project-scoped API key. No global deployment API key is required.",
      ],
    };
  }

  return {
    integration: "developer-api",
    ok: true,
    level: projectKeysReady || legacyReady ? "success" : "warning",
    code: projectKeysReady ? "DEVELOPER_API_PROJECT_KEYS_READY" : legacyReady ? "DEVELOPER_API_LEGACY_KEY_READY" : "DEVELOPER_API_LOCAL_ONLY",
    message: projectKeysReady
      ? "The Developer API can authenticate project-scoped keys created in Developer Console."
      : legacyReady
        ? "The Developer API is using the legacy server-managed bearer key. Migrate normal product use to project-scoped keys."
        : "The Developer API is available only for local development until durable project-key persistence is configured.",
    details: {
      endpoint: "/api/v1/evaluate",
      auth: projectKeysReady || legacyReady ? "enabled" : "local-only",
    },
    ...(projectKeysReady ? { nextSteps: ["Create and manage project API keys in Developer Console."] } : {}),
  };
}

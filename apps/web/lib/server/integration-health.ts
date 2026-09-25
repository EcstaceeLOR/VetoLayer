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
  const apiNeedsAuth = nodeEnv === "production" && !environment.apiAuthConfigured;

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
      authConfigured: environment.apiAuthConfigured,
      ready: !apiNeedsAuth,
      state: environment.apiAuthConfigured ? "ready" : nodeEnv === "production" ? "needs-config" : "local-only",
      missing: apiNeedsAuth ? ["VETOLAYER_API_KEY"] : [],
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

  if (nodeEnv === "production" && !environment.apiAuthConfigured) {
    return {
      integration: "developer-api",
      ok: false,
      level: "warning",
      code: "API_KEY_MISSING",
      message: "The Developer API is disabled in production until bearer authentication is configured.",
      details: { endpoint: "/api/v1/evaluate", auth: "required" },
      nextSteps: [
        "Set VETOLAYER_API_KEY as a server-side environment variable.",
        "Redeploy, then test the Developer API configuration again.",
      ],
    };
  }

  return {
    integration: "developer-api",
    ok: true,
    level: environment.apiAuthConfigured ? "success" : "warning",
    code: environment.apiAuthConfigured ? "DEVELOPER_API_READY" : "DEVELOPER_API_LOCAL_ONLY",
    message: environment.apiAuthConfigured
      ? "The Developer API is ready and bearer authentication is enabled."
      : "The Developer API is available only for local development until a bearer key is configured.",
    details: {
      endpoint: "/api/v1/evaluate",
      auth: environment.apiAuthConfigured ? "enabled" : "local-only",
    },
  };
}

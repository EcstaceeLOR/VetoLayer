import type { IntegrationReadiness, IntegrationTestResult } from "../integration-contracts";
import { readServerEnvironment, type ServerEnvironment } from "./env";

export function getIntegrationReadiness(input?: {
  environment?: ServerEnvironment;
  nodeEnv?: string;
}): IntegrationReadiness {
  const environment = input?.environment ?? readServerEnvironment();
  const nodeEnv = input?.nodeEnv ?? process.env.NODE_ENV;
  const appConfigured = Boolean(environment.githubAppConfigured);
  const persistenceRequired = nodeEnv === "production" && !environment.persistenceConfigured;
  const githubMissing = [
    ...(!appConfigured ? ["GitHub App registration"] : []),
    ...(persistenceRequired ? ["SUPABASE persistence"] : []),
    ...(!environment.servConfigured ? ["SERV_API_KEY + SERV_MODEL"] : []),
  ];
  const apiNeedsAuth = nodeEnv === "production" && !environment.apiAuthConfigured;

  return {
    github: {
      configured: appConfigured,
      appConfigured,
      ...(environment.githubAppSlug ? { appSlug: environment.githubAppSlug } : {}),
      persistenceConfigured: environment.persistenceConfigured,
      servConfigured: environment.servConfigured,
      ready: githubMissing.length === 0,
      state: githubMissing.length === 0 ? "ready" : "needs-config",
      missing: githubMissing,
      setupMode: "github-app",
    },
    developerApi: {
      endpoint: "/api/v1/evaluate",
      authConfigured: environment.apiAuthConfigured,
      ready: !apiNeedsAuth,
      state: environment.apiAuthConfigured
        ? "ready"
        : nodeEnv === "production"
          ? "needs-config"
          : "local-only",
      missing: apiNeedsAuth ? ["VETOLAYER_API_KEY"] : [],
    },
  };
}

/**
 * Tests deployment-level GitHub App infrastructure only. A product scope is not
 * considered connected until a verified installation record exists for it.
 */
export function testGitHubIntegration(input?: {
  environment?: ServerEnvironment;
  nodeEnv?: string;
}): IntegrationTestResult {
  const environment = input?.environment ?? readServerEnvironment();
  const nodeEnv = input?.nodeEnv ?? process.env.NODE_ENV;

  if (!environment.githubAppConfigured) {
    return {
      integration: "github",
      ok: false,
      level: "error",
      code: "GITHUB_APP_NOT_CONFIGURED",
      message: "The VetoLayer GitHub App has not been configured by the deployment operator.",
      nextSteps: ["Configure the GitHub App registration once for this VetoLayer deployment."],
    };
  }
  if (nodeEnv === "production" && !environment.persistenceConfigured) {
    return {
      integration: "github",
      ok: false,
      level: "error",
      code: "GITHUB_APP_PERSISTENCE_REQUIRED",
      message: "GitHub App installations require durable persistence on production deployments.",
      nextSteps: ["Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and apply the GitHub App migration."],
    };
  }
  if (!environment.servConfigured) {
    return {
      integration: "github",
      ok: true,
      level: "warning",
      code: "GITHUB_APP_READY_SERV_MISSING",
      message: "The GitHub App can be installed, but contextual judgment is not ready until SERV is configured.",
      nextSteps: ["Configure SERV_API_KEY and SERV_MODEL before relying on contextual GitHub decisions."],
    };
  }
  return {
    integration: "github",
    ok: true,
    level: "success",
    code: "GITHUB_APP_READY",
    message: "The GitHub App infrastructure is ready for workspace-scoped installations.",
  };
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

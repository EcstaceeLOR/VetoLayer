import type { IntegrationReadiness, IntegrationTestResult } from "../integration-contracts";
import { readServerEnvironment, type ServerEnvironment } from "./env";

export function getIntegrationReadiness(input?: {
  environment?: ServerEnvironment;
  nodeEnv?: string;
}): IntegrationReadiness {
  const environment = input?.environment ?? readServerEnvironment();
  const nodeEnv = input?.nodeEnv ?? process.env.NODE_ENV;

  const githubMissing = [
    ...(!environment.githubTokenConfigured ? ["GITHUB_TOKEN"] : []),
    ...(!environment.servConfigured ? ["SERV_API_KEY + SERV_MODEL"] : []),
  ];

  const apiNeedsAuth = nodeEnv === "production" && !environment.apiAuthConfigured;

  return {
    github: {
      configured: Boolean(environment.githubTokenConfigured),
      servConfigured: environment.servConfigured,
      ready: githubMissing.length === 0,
      state: githubMissing.length === 0 ? "ready" : "needs-config",
      missing: githubMissing,
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

export async function testGitHubIntegration(input?: {
  environment?: ServerEnvironment;
  githubToken?: string;
  fetchImpl?: typeof fetch;
}): Promise<IntegrationTestResult> {
  const environment = input?.environment ?? readServerEnvironment();
  const githubToken = input?.githubToken ?? process.env.GITHUB_TOKEN?.trim();
  const fetchImpl = input?.fetchImpl ?? fetch;

  if (!githubToken) {
    return {
      integration: "github",
      ok: false,
      level: "error",
      code: "GITHUB_TOKEN_MISSING",
      message: "GitHub Gate is not configured yet.",
      nextSteps: [
        "Set GITHUB_TOKEN as a server-side environment variable.",
        "Redeploy or restart VetoLayer, then test the connection again.",
      ],
    };
  }

  let response: Response;
  try {
    response = await fetchImpl("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "User-Agent": "VetoLayer-Integration-Test",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
  } catch {
    return {
      integration: "github",
      ok: false,
      level: "error",
      code: "GITHUB_UNREACHABLE",
      message: "VetoLayer could not reach GitHub from the server.",
      nextSteps: [
        "Check outbound network access from the deployment.",
        "Retry the connection test after connectivity is restored.",
      ],
    };
  }

  if (!response.ok) {
    const code = response.status === 401 ? "GITHUB_TOKEN_INVALID" : "GITHUB_CONNECTION_FAILED";
    return {
      integration: "github",
      ok: false,
      level: "error",
      code,
      message:
        response.status === 401
          ? "GitHub rejected the configured token."
          : `GitHub connection test failed with status ${response.status}.`,
      nextSteps: [
        "Verify the token is active and has access to the repositories VetoLayer will inspect.",
        "Replace GITHUB_TOKEN server-side and redeploy before retrying.",
      ],
    };
  }

  const body = (await response.json().catch(() => ({}))) as { login?: unknown };
  const account = typeof body.login === "string" ? body.login : undefined;

  if (!environment.servConfigured) {
    return {
      integration: "github",
      ok: true,
      level: "warning",
      code: "GITHUB_CONNECTED_SERV_MISSING",
      message: "GitHub is connected, but contextual judgment is not ready until SERV is configured.",
      details: account ? { account } : undefined,
      nextSteps: [
        "Set SERV_API_KEY and SERV_MODEL server-side.",
        "Retest after redeploying so sensitive GitHub actions can reach SERV Reasoning.",
      ],
    };
  }

  return {
    integration: "github",
    ok: true,
    level: "success",
    code: "GITHUB_CONNECTED",
    message: "GitHub Gate is connected and SERV contextual reasoning is configured.",
    details: account ? { account } : undefined,
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

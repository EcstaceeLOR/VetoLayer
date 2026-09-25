export type IntegrationKey = "github" | "developer-api";

export type IntegrationReadiness = {
  github: {
    configured: boolean;
    appConfigured?: boolean;
    appSlug?: string;
    persistenceConfigured?: boolean;
    servConfigured: boolean;
    ready: boolean;
    state: "ready" | "needs-config";
    missing: string[];
    setupMode?: "github-app";
  };
  developerApi: {
    endpoint: "/api/v1/evaluate";
    authConfigured: boolean;
    ready: boolean;
    state: "ready" | "local-only" | "needs-config";
    missing: string[];
  };
};

export type IntegrationTestResult = {
  integration: IntegrationKey;
  ok: boolean;
  level: "success" | "warning" | "error";
  code: string;
  message: string;
  details?: {
    account?: string;
    endpoint?: string;
    auth?: "enabled" | "disabled" | "required" | "local-only";
    repositories?: number;
    installationId?: number;
  };
  nextSteps?: string[];
};

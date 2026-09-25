export type IntegrationKey = "github" | "developer-api";

export type IntegrationReadiness = {
  github: {
    /** Server-level GitHub App registration, not a user/project connection. */
    configured: boolean;
    servConfigured: boolean;
    ready: boolean;
    state: "ready" | "needs-config";
    missing: string[];
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
  };
  nextSteps?: string[];
};

export type GitHubInstallationView = {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  repositorySelection: "all" | "selected";
  state: "ready" | "suspended" | "revoked" | "permission-error" | "disconnected";
  permissions: Record<string, string>;
  lastSyncAt?: string;
  lastEventAt?: string;
  updatedAt: string;
};

export type GitHubRepositoryView = {
  connectionId: string;
  repositoryId: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  connected: boolean;
  updatedAt: string;
};

export type GitHubConnectionPayload = {
  app: {
    configured: boolean;
    missing: string[];
    requiredPermissions: Record<string, string>;
  };
  installation: GitHubInstallationView | null;
  repositories: GitHubRepositoryView[];
  persistence: "supabase" | "memory";
  scope?: { workspaceId: string; projectId: string; environmentId: string };
};

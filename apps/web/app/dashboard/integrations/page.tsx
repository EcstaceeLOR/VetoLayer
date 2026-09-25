import Link from "next/link";
import { IntegrationSetup } from "./integration-setup";
import type { GitHubInstallationView, IntegrationReadiness } from "../../../lib/integration-contracts";
import { hasWorkspacePermission } from "../../../lib/workspace-model";
import { getGitHubAppStore } from "../../../lib/server/github-app-store";
import { getIntegrationReadiness } from "../../../lib/server/integration-health";
import { getAuthenticatedWorkspace } from "../../../lib/server/workspace";

export const dynamic = "force-dynamic";

const githubErrors: Record<string, string> = {
  FORBIDDEN: "Your workspace role can view GitHub connections but cannot change them.",
  PROJECT_ARCHIVED: "Archived projects cannot change integrations.",
  GITHUB_APP_NOT_CONFIGURED: "The deployment operator has not finished the VetoLayer GitHub App registration.",
  GITHUB_STATE_INVALID: "The GitHub connection request could not be verified. Start the connection again.",
  GITHUB_STATE_EXPIRED: "The GitHub connection request expired. Start the connection again.",
  GITHUB_SCOPE_MISMATCH: "Your active VetoLayer project changed during GitHub setup. Start the connection again from the current project.",
  GITHUB_INSTALLATION_INVALID: "GitHub did not return a valid installation. Start the connection again.",
  GITHUB_INSTALLATION_FORBIDDEN: "The GitHub account that authorized this request cannot access that installation.",
  GITHUB_INSTALLATION_WRONG_APP: "That installation belongs to a different GitHub App.",
  GITHUB_OAUTH_FAILED: "GitHub authorization could not be completed. Start the connection again.",
  GITHUB_OAUTH_STATE_MISSING: "The GitHub authorization session expired. Start the connection again.",
  GITHUB_OAUTH_STATE_INVALID: "The GitHub authorization session could not be verified. Start the connection again.",
  GITHUB_CONNECT_FAILED: "GitHub could not be connected safely. Start the connection again.",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string; github_error?: string }>;
}) {
  const params = await searchParams;
  const readiness = safeReadiness();
  const workspace = await getAuthenticatedWorkspace();
  let githubInstallations: GitHubInstallationView[] = [];
  let canManageGitHub = false;

  if (workspace) {
    canManageGitHub = hasWorkspacePermission(workspace.role, "integrations.write");
    try {
      const { store } = getGitHubAppStore();
      const rows = await store.list({
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
        environmentId: workspace.environmentId,
      });
      githubInstallations = rows.map((row) => ({
        installationId: row.installationId,
        accountLogin: row.accountLogin,
        accountType: row.accountType,
        ...(row.accountUrl ? { accountUrl: row.accountUrl } : {}),
        ...(row.installationUrl ? { installationUrl: row.installationUrl } : {}),
        repositorySelection: row.repositorySelection,
        status: row.status,
        repositories: row.repositories.map((repository) => ({
          id: repository.id,
          name: repository.name,
          fullName: repository.fullName,
          private: repository.private,
          htmlUrl: repository.htmlUrl,
          defaultBranch: repository.defaultBranch,
          archived: repository.archived,
          disabled: repository.disabled,
        })),
        ...(row.lastSyncedAt ? { lastSyncedAt: row.lastSyncedAt } : {}),
        ...(row.lastEvent ? { lastEvent: row.lastEvent } : {}),
        updatedAt: row.updatedAt,
      }));
    } catch {
      githubInstallations = [];
    }
  }

  const githubConnected = githubInstallations.some((connection) => connection.status === "active");
  const anyReady = githubConnected || readiness.developerApi.ready;
  const githubNotice = params.github_error
    ? { tone: "danger" as const, title: "GitHub connection failed", message: githubErrors[params.github_error] ?? "GitHub could not be connected safely. Start the connection again." }
    : params.github === "connected"
      ? { tone: "success" as const, title: "GitHub connected", message: "The verified GitHub App installation is now scoped to this project and environment." }
      : undefined;

  return (
    <>
      <header className="dashboardHeader compactHeader">
        <div>
          <p className="eyebrow">INTEGRATIONS</p>
          <h1 className="dashboardTitle">Put VetoLayer in front of the tool, not inside the agent.</h1>
          <p className="dashboardIntro">Connect a GitHub App installation or the stable Developer API from one place. Installation tokens and provider credentials remain server-only.</p>
        </div>
      </header>

      {!anyReady ? (
        <section className="dashboardEmptyState compactEmptyState firstRunSurfaceNote">
          <p className="eyebrow">NO EXECUTION PATH CONNECTED</p>
          <h2>Choose one path to your first real decision.</h2>
          <p>Install VetoLayer on GitHub for coding-agent actions, or use the Developer API for another tool. You only need one ready path to start generating real Decision Receipts.</p>
          <div className="emptyActions">
            <a className="primaryLink" href="#integration-options">Configure below →</a>
            <Link className="rowLink" href="/demo">Preview the decision flow →</Link>
          </div>
        </section>
      ) : null}

      <div id="integration-options">
        <IntegrationSetup
          initialReadiness={readiness}
          initialGitHubInstallations={githubInstallations}
          canManageGitHub={canManageGitHub}
          githubNotice={githubNotice}
        />
      </div>
    </>
  );
}

function safeReadiness(): IntegrationReadiness {
  try {
    return getIntegrationReadiness();
  } catch {
    return {
      github: {
        configured: false,
        appConfigured: false,
        persistenceConfigured: false,
        servConfigured: false,
        ready: false,
        state: "needs-config",
        missing: ["valid server configuration"],
        setupMode: "github-app",
      },
      developerApi: {
        endpoint: "/api/v1/evaluate",
        authConfigured: false,
        ready: false,
        state: "needs-config",
        missing: ["valid server configuration"],
      },
    };
  }
}

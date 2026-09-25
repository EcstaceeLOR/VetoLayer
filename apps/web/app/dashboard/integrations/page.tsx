import Link from "next/link";
import { IntegrationSetup } from "./integration-setup";
import type { GitHubConnectionPayload, IntegrationReadiness } from "../../../lib/integration-contracts";
import { getIntegrationReadiness } from "../../../lib/server/integration-health";
import { loadGitHubConnectionPayload } from "../../../lib/server/github-app-service";
import { getAuthenticatedWorkspace } from "../../../lib/server/workspace";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ github?: string }> }) {
  const params = await searchParams;
  const readiness = safeReadiness();
  const workspace = await getAuthenticatedWorkspace();
  const github = workspace
    ? await loadGitHubConnectionPayload({ workspaceId: workspace.workspaceId, projectId: workspace.projectId, environmentId: workspace.environmentId })
    : emptyGitHubConnection(readiness);
  const githubReady = github.installation?.state === "ready" && github.repositories.some((repo) => repo.connected);
  const anyReady = githubReady || readiness.developerApi.ready;

  return (
    <>
      <header className="dashboardHeader compactHeader">
        <div>
          <p className="eyebrow">INTEGRATIONS</p>
          <h1 className="dashboardTitle">Connect the tools VetoLayer will govern.</h1>
          <p className="dashboardIntro">Install VetoLayer as a GitHub App or use the stable Developer API. Connections are scoped to the active workspace, project, and environment; operational tokens never enter the browser.</p>
        </div>
      </header>

      {!anyReady ? (
        <section className="dashboardEmptyState compactEmptyState firstRunSurfaceNote">
          <p className="eyebrow">NO EXECUTION PATH CONNECTED</p>
          <h2>Choose one path to your first real decision.</h2>
          <p>Install the GitHub App for pull-request and deployment evidence, or use the Developer API for another agent or tool. A real connection—not a demo flag—unlocks operational onboarding.</p>
          <div className="emptyActions">
            <a className="primaryLink" href="#integration-options">Configure below →</a>
            <Link className="rowLink" href="/demo">Preview the product example →</Link>
          </div>
        </section>
      ) : null}

      <div id="integration-options">
        <IntegrationSetup initialReadiness={readiness} initialGitHub={github} githubMessage={params.github} />
      </div>
    </>
  );
}

function safeReadiness(): IntegrationReadiness {
  try { return getIntegrationReadiness(); } catch {
    return {
      github: { configured: false, servConfigured: false, ready: false, state: "needs-config", missing: ["valid server configuration"] },
      developerApi: { endpoint: "/api/v1/evaluate", authConfigured: false, ready: false, state: "needs-config", missing: ["valid server configuration"] },
    };
  }
}

function emptyGitHubConnection(readiness: IntegrationReadiness): GitHubConnectionPayload {
  return {
    app: { configured: readiness.github.configured, missing: readiness.github.missing, requiredPermissions: { pull_requests: "read", checks: "read", statuses: "read" } },
    installation: null,
    repositories: [],
    persistence: "memory",
  };
}

import Link from "next/link";
import { IntegrationSetup } from "./integration-setup";
import type { IntegrationReadiness } from "../../../lib/integration-contracts";
import { getIntegrationReadiness } from "../../../lib/server/integration-health";

export const dynamic = "force-dynamic";

export default function IntegrationsPage() {
  const readiness = safeReadiness();
  const anyReady = readiness.github.ready || readiness.developerApi.ready;

  return (
    <>
      <header className="dashboardHeader compactHeader">
        <div>
          <p className="eyebrow">INTEGRATIONS</p>
          <h1 className="dashboardTitle">Put VetoLayer in front of the tool, not inside the agent.</h1>
          <p className="dashboardIntro">Connect the GitHub gate or stable Developer API from one place. VetoLayer keeps secrets server-side and gives operators a clear connection state before autonomous actions depend on it.</p>
        </div>
      </header>

      {!anyReady ? (
        <section className="dashboardEmptyState compactEmptyState firstRunSurfaceNote">
          <p className="eyebrow">NO EXECUTION PATH CONNECTED</p>
          <h2>Choose one path to your first real decision.</h2>
          <p>Use GitHub Gate if the protected action is a merge or deployment. Use the Developer API for any other agent or tool. You only need one ready path to start generating real Decision Receipts.</p>
          <div className="emptyActions">
            <a className="primaryLink" href="#integration-options">Configure below →</a>
            <Link className="rowLink" href="/demo">Preview the full flow first →</Link>
          </div>
        </section>
      ) : null}

      <div id="integration-options">
        <IntegrationSetup initialReadiness={readiness} />
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
        servConfigured: false,
        ready: false,
        state: "needs-config",
        missing: ["valid server configuration"],
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

import { IntegrationSetup } from "./integration-setup";
import type { IntegrationReadiness } from "../../../lib/integration-contracts";
import { getIntegrationReadiness } from "../../../lib/server/integration-health";

export const dynamic = "force-dynamic";

export default function IntegrationsPage() {
  const readiness = safeReadiness();

  return (
    <>
      <header className="dashboardHeader compactHeader">
        <div>
          <p className="eyebrow">INTEGRATIONS</p>
          <h1 className="dashboardTitle">Put VetoLayer in front of the tool, not inside the agent.</h1>
          <p className="dashboardIntro">Connect the GitHub gate or stable Developer API from one place. VetoLayer keeps secrets server-side and gives operators a clear connection state before autonomous actions depend on it.</p>
        </div>
      </header>
      <IntegrationSetup initialReadiness={readiness} />
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

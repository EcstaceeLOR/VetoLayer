import Link from "next/link";
import { redirect } from "next/navigation";
import { hasWorkspacePermission } from "../../../lib/workspace-model";
import { getAuthenticatedWorkspace } from "../../../lib/server/workspace";
import { DeveloperConsole } from "./developer-console";

export const dynamic = "force-dynamic";

export default async function DevelopersPage() {
  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) redirect("/onboarding");
  if (!hasWorkspacePermission(workspace.role, "integrations.write")) redirect("/dashboard/integrations");

  return (
    <section className="healthPage">
      <header className="healthHero">
        <div>
          <span className="vlEyebrow">Developer Console</span>
          <h1>Ship agents through a real VetoLayer credential boundary.</h1>
          <p>Create project-scoped keys, test the live evaluation API, configure signed webhooks, and inspect recent API activity without editing deployment environment variables.</p>
          <div className="emptyActions"><Link className="rowLink" href="/dashboard/docs/developer-quickstart">Developer quickstart →</Link><Link className="rowLink" href="/dashboard/docs/webhooks">Webhook reference →</Link></div>
        </div>
      </header>
      <DeveloperConsole projectName={workspace.project.name} environmentName={workspace.environment.name} />
    </section>
  );
}

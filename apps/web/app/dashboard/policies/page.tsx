import Link from "next/link";
import { PolicyStudio } from "../../../components/policy-studio";
import { policyStudioStarters } from "../../../lib/policy-studio";
import { getOptionalPolicyStore } from "../../../lib/server/policy-store";
import { getAuthenticatedWorkspace } from "../../../lib/server/workspace";

export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const hasWorkspacePolicies = await workspaceHasPolicies();

  return (
    <>
      <header className="dashboardHeader compactHeader policyPageHeader">
        <div>
          <p className="eyebrow">POLICY STUDIO</p>
          <h1 className="dashboardTitle">Rules where certainty is possible. Reasoning where it isn&apos;t.</h1>
          <p className="dashboardIntro">Author hard policy deterministically, reserve SERV for contextual judgment, and test the exact same policy contract before activating it.</p>
        </div>
      </header>

      {!hasWorkspacePolicies ? (
        <section className="dashboardEmptyState compactEmptyState firstRunSurfaceNote">
          <p className="eyebrow">STARTER LIBRARY</p>
          <h2>No durable workspace policies yet.</h2>
          <p>The editor below is preloaded with starter templates so the screen is useful immediately. They are examples—not proof that your workspace is configured. Edit and save one to create your first real policy.</p>
          <div className="emptyActions">
            <a className="primaryLink" href="#policy-studio">Use a starter policy →</a>
            <Link className="rowLink" href="/demo">See policy + SERV reasoning in action →</Link>
          </div>
        </section>
      ) : null}

      <div id="policy-studio">
        <PolicyStudio initialPolicies={policyStudioStarters} />
      </div>
    </>
  );
}

async function workspaceHasPolicies() {
  try {
    const workspace = await getAuthenticatedWorkspace();
    const store = getOptionalPolicyStore();
    if (!workspace || !store) return false;
    return (await store.list(workspace.workspaceId)).length > 0;
  } catch {
    return false;
  }
}

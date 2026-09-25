import { redirect } from "next/navigation";
import { PolicyStudio } from "../../../components/policy-studio";
import { hasWorkspacePermission } from "../../../lib/workspace-model";
import { getAuthenticatedWorkspace } from "../../../lib/server/workspace";
import "./policy-studio.css";

export const dynamic = "force-dynamic";

export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string; version?: string }>;
}) {
  const workspace = await getAuthenticatedWorkspace();
  if (!workspace) redirect("/onboarding");
  const query = await searchParams;
  const parsedVersion = query.version ? Number(query.version) : undefined;
  const canWrite = hasWorkspacePermission(workspace.role, "policies.write");

  return (
    <section className="policyPageV2">
      <header className="healthHero policyLifecycleHero">
        <div>
          <span className="vlEyebrow">Policy Studio</span>
          <h1>Governance with a publication history, not mutable rules.</h1>
          <p>Draft policy safely, simulate it against sample or historical actions, review conflicts, publish an immutable version, and preserve the exact policy meaning behind every Decision Receipt.</p>
        </div>
        <div className="policyLifecycleHeroMeta">
          <span>{workspace.workspace.name}</span>
          <strong>{workspace.project.name}</strong>
          <span>{workspace.environment.name}</span>
        </div>
      </header>

      {!canWrite ? (
        <div className="vlNotice vlNoticeInfo" role="status">
          <strong>Read-only policy access</strong>
          <p>Your workspace role can inspect lifecycle state, version history, diffs, and simulations. Owners and admins can create, edit, activate, deactivate, and roll back policy versions.</p>
        </div>
      ) : null}

      <PolicyStudio
        canWrite={canWrite}
        projectName={workspace.project.name}
        initialFocusPolicyId={query.focus}
        initialFocusVersion={Number.isInteger(parsedVersion) && (parsedVersion ?? 0) > 0 ? parsedVersion : undefined}
      />
    </section>
  );
}

import { redirect } from "next/navigation";
import { DataLifecycleClient } from "../../../components/data-lifecycle-client";
import { hasWorkspacePermission } from "../../../lib/workspace-model";
import { getDataLifecycleStore } from "../../../lib/server/data-lifecycle";
import { getWorkspaceSettingsStore } from "../../../lib/server/settings-store";
import { getAuthenticatedWorkspace } from "../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../lib/server/workspace-store";
import "./data.css";

export const dynamic = "force-dynamic";

export default async function DataLifecyclePage() {
  const context = await getAuthenticatedWorkspace();
  if (!context) redirect("/onboarding");
  if (!hasWorkspacePermission(context.role, "workspace.manage")) redirect("/dashboard/settings");

  const { store: workspaceStore } = getWorkspaceStore();
  const { store: lifecycleStore, persistence } = getDataLifecycleStore();
  const [members, retention, jobs] = await Promise.all([
    workspaceStore.listMembers(context.workspaceId),
    getWorkspaceSettingsStore().store.get(context.workspaceId),
    lifecycleStore.listForWorkspace(context.workspaceId, 100),
  ]);

  return (
    <section className="healthPage dataLifecyclePage">
      <header className="healthHero dataHero">
        <div>
          <span className="vlEyebrow">DATA & OFFBOARDING</span>
          <h1>Know what is stored. Export it safely. Leave deliberately.</h1>
          <p>Retention, portable exports, ownership transfer, workspace removal, and account offboarding all use explicit server-owned rules. Archiving never silently deletes historical receipts.</p>
        </div>
      </header>
      <DataLifecycleClient
        workspaceName={context.workspace.name}
        role={context.role}
        retention={{ decisionRetentionDays: retention.decisionRetentionDays, reviewRetentionDays: retention.reviewRetentionDays, notificationRetentionDays: retention.notificationRetentionDays }}
        members={members.map(({ userId, email, displayName, role }) => ({ userId, ...(email ? { email } : {}), ...(displayName ? { displayName } : {}), role }))}
        currentUserId={context.userId}
        initialJobs={jobs}
        persistence={persistence}
      />
    </section>
  );
}

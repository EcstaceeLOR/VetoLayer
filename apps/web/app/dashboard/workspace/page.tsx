import { redirect } from "next/navigation";
import { WorkspaceManagement } from "../../../components/workspace-management";
import { getAuthenticatedWorkspace } from "../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../lib/server/workspace-store";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const context = await getAuthenticatedWorkspace();
  if (!context) redirect("/onboarding");

  const { store } = getWorkspaceStore();
  const [members, invitations, projects, environments] = await Promise.all([
    store.listMembers(context.workspaceId),
    store.listInvitations(context.workspaceId),
    store.listProjects(context.workspaceId, true),
    store.listEnvironments(context.workspaceId, context.projectId, true),
  ]);

  return (
    <WorkspaceManagement
      workspace={context.workspace}
      project={context.project}
      environment={context.environment}
      role={context.role}
      projects={projects}
      environments={environments}
      members={members}
      invitations={invitations.map(({ tokenHash: _tokenHash, ...invite }) => invite)}
    />
  );
}

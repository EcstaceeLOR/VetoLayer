import { redirect } from "next/navigation";
import { WorkspaceManagement } from "../../../components/workspace-management";
import { hasWorkspacePermission } from "../../../lib/workspace-model";
import { getAuthenticatedWorkspace } from "../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../lib/server/workspace-store";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const context = await getAuthenticatedWorkspace();
  if (!context) redirect("/onboarding");

  const { store } = getWorkspaceStore();
  const canManageMembers = hasWorkspacePermission(context.role, "members.manage");
  const [members, invitations, projects, environments] = await Promise.all([
    canManageMembers ? store.listMembers(context.workspaceId) : Promise.resolve([]),
    canManageMembers ? store.listInvitations(context.workspaceId) : Promise.resolve([]),
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
      invitations={invitations.map((invite) => ({
        id: invite.id,
        workspaceId: invite.workspaceId,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        invitedByUserId: invite.invitedByUserId,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        ...(invite.acceptedAt ? { acceptedAt: invite.acceptedAt } : {}),
      }))}
    />
  );
}

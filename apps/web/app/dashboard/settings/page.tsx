import { redirect } from "next/navigation";
import { SettingsCenter } from "../../../components/settings-center";
import { WorkspaceManagement } from "../../../components/workspace-management";
import { hasWorkspacePermission } from "../../../lib/workspace-model";
import { getDeveloperStore } from "../../../lib/server/developer-store";
import { loadGitHubConnectionPayload } from "../../../lib/server/github-app-service";
import { defaultNotificationPreference, getNotificationStore, PRODUCT_NOTIFICATION_EVENTS } from "../../../lib/server/notification-store";
import { getWorkspaceSettingsStore } from "../../../lib/server/settings-store";
import { getAuthenticatedWorkspace } from "../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../lib/server/workspace-store";
import "./settings.css";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const context = await getAuthenticatedWorkspace();
  if (!context) redirect("/onboarding");

  const { store: workspaceStore } = getWorkspaceStore();
  const canManageMembers = hasWorkspacePermission(context.role, "members.manage");
  const canReadIntegrations = hasWorkspacePermission(context.role, "integrations.read");
  const canManageIntegrations = hasWorkspacePermission(context.role, "integrations.write");
  const canManageWorkspace = hasWorkspacePermission(context.role, "workspace.manage");

  const [members, invitations, projects, environments, retention, notificationPreference] = await Promise.all([
    canManageMembers ? workspaceStore.listMembers(context.workspaceId) : Promise.resolve([]),
    canManageMembers ? workspaceStore.listInvitations(context.workspaceId) : Promise.resolve([]),
    workspaceStore.listProjects(context.workspaceId, true),
    workspaceStore.listEnvironments(context.workspaceId, context.projectId, true),
    getWorkspaceSettingsStore().store.get(context.workspaceId),
    getNotificationStore().store.getPreference(context.workspaceId, context.userId).then((value) => value ?? defaultNotificationPreference(context.workspaceId, context.userId)),
  ]);

  let github = { configured: false, connected: false, repositories: 0, state: "Restricted" } as { configured: boolean; connected: boolean; account?: string; repositories: number; state: string };
  let developer = { activeKeys: [] as Array<{ id: string; name: string; keyPrefix: string; lastUsedAt?: string }>, activeWebhooks: [] as Array<{ id: string; name: string; url: string; lastDeliveryAt?: string }> };
  if (canReadIntegrations) {
    try {
      const connection = await loadGitHubConnectionPayload({ workspaceId: context.workspaceId, projectId: context.projectId, environmentId: context.environmentId });
      github = {
        configured: connection.app.configured,
        connected: Boolean(connection.installation),
        ...(connection.installation?.accountLogin ? { account: connection.installation.accountLogin } : {}),
        repositories: connection.repositories.filter((item) => item.connected).length,
        state: connection.installation?.state ?? (connection.app.configured ? "Not connected" : "Provider setup"),
      };
    } catch {
      github = { configured: false, connected: false, repositories: 0, state: "Unavailable" };
    }
    try {
      const { store } = getDeveloperStore();
      const scope = { workspaceId: context.workspaceId, projectId: context.projectId, environmentId: context.environmentId };
      const [keys, hooks] = await Promise.all([store.listApiKeys(scope), store.listWebhooks(scope)]);
      developer = {
        activeKeys: keys.filter((key) => key.status === "active").map(({ id, name, keyPrefix, lastUsedAt }) => ({ id, name, keyPrefix, ...(lastUsedAt ? { lastUsedAt } : {}) })),
        activeWebhooks: hooks.filter((hook) => hook.status === "active").map(({ id, name, url, lastDeliveryAt }) => ({ id, name, url, ...(lastDeliveryAt ? { lastDeliveryAt } : {}) })),
      };
    } catch {
      developer = { activeKeys: [], activeWebhooks: [] };
    }
  }

  const invitationViews = invitations.map((invite) => ({
    id: invite.id,
    workspaceId: invite.workspaceId,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    invitedByUserId: invite.invitedByUserId,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    ...(invite.acceptedAt ? { acceptedAt: invite.acceptedAt } : {}),
  }));

  return (
    <>
      <header className="dashboardHeader compactHeader settingsHeader">
        <div><p className="eyebrow">SETTINGS</p><h1 className="dashboardTitle">Administration with explicit boundaries.</h1><p className="dashboardIntro">Manage the workspace, people, projects, integrations, developer access, notifications, account security, retention, and destructive actions from one persisted control surface.</p></div>
        <span className="settingsRoleBadge">{context.role}</span>
      </header>

      <nav className="settingsTopNav" aria-label="Settings sections">
        <a href="#workspace">Workspace & team</a><a href="#projects">Projects & environments</a><a href="#integrations">Integrations</a><a href="#developer">API & webhooks</a><a href="#notifications">Notifications</a><a href="#security">Security</a><a href="#data-retention">Data</a><a href="#danger-zone">Danger zone</a>
      </nav>

      <section id="workspace" className="settingsWorkspaceSection">
        <div id="projects" className="settingsAnchor" />
        <WorkspaceManagement
          embedded
          workspace={context.workspace}
          project={context.project}
          environment={context.environment}
          role={context.role}
          projects={projects}
          environments={environments}
          members={members}
          invitations={invitationViews}
        />
      </section>

      <SettingsCenter
        role={context.role}
        account={{ ...(context.email ? { email: context.email } : {}), ...(context.displayName ? { displayName: context.displayName } : {}) }}
        canManageWorkspace={canManageWorkspace}
        canManageIntegrations={canManageIntegrations}
        canReadIntegrations={canReadIntegrations}
        workspace={{ id: context.workspace.id, name: context.workspace.name, updatedAt: context.workspace.updatedAt }}
        project={{ id: context.project.id, name: context.project.name }}
        environment={{ id: context.environment.id, name: context.environment.name }}
        retention={retention}
        notificationPreference={notificationPreference}
        notificationEvents={[...PRODUCT_NOTIFICATION_EVENTS]}
        projects={projects.map(({ id, name, status }) => ({ id, name, status }))}
        github={github}
        developer={developer}
        settingsPersistence={getWorkspaceSettingsStore().persistence}
      />
    </>
  );
}

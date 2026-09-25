"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, ProjectEnvironment, Workspace, WorkspaceInvitation, WorkspaceMember, WorkspaceRole } from "../lib/workspace-model";
import { hasWorkspacePermission } from "../lib/workspace-model";
import { Badge, Button, Card, Field, Input, Notice, Select, Table, TableShell } from "./ui/primitives";

type Props = {
  workspace: Workspace;
  project: Project;
  environment: ProjectEnvironment;
  role: WorkspaceRole;
  projects: Project[];
  environments: ProjectEnvironment[];
  members: WorkspaceMember[];
  invitations: Array<Omit<WorkspaceInvitation, "tokenHash">>;
  embedded?: boolean;
};

type ApiResponse = { error?: { message?: string; code?: string }; inviteUrl?: string } & Record<string, unknown>;

export function WorkspaceManagement(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; title: string; message: string } | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const canManageWorkspace = hasWorkspacePermission(props.role, "workspace.manage");
  const canManageProjects = hasWorkspacePermission(props.role, "projects.manage");
  const canManageEnvironments = hasWorkspacePermission(props.role, "environments.manage");
  const canManageMembers = hasWorkspacePermission(props.role, "members.manage");

  async function call(path: string, init: RequestInit, action: string, success: string) {
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch(path, init);
      const result = await response.json() as ApiResponse;
      if (!response.ok) {
        setNotice({ tone: "danger", title: result.error?.code === "SETTINGS_CONFLICT" ? "Settings changed elsewhere" : "Action failed", message: result.error?.message ?? "VetoLayer could not complete that action." });
        if (response.status === 409 && result.error?.code === "SETTINGS_CONFLICT") router.refresh();
        return null;
      }
      setNotice({ tone: "success", title: "Saved", message: success });
      router.refresh();
      return result;
    } catch {
      setNotice({ tone: "danger", title: "Action failed", message: "The workspace service is temporarily unavailable." });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function renameWorkspace(formData: FormData) {
    const name = String(formData.get("workspaceName") ?? "");
    await call("/api/workspaces/current", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rename", name, expectedUpdatedAt: props.workspace.updatedAt }) }, "workspace-rename", "Workspace name updated.");
  }

  async function createProject(formData: FormData) {
    const name = String(formData.get("projectName") ?? "");
    await call("/api/workspaces/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }, "project-create", "Project created with Development, Staging, and Production environments.");
  }

  async function renameProject(formData: FormData) {
    const name = String(formData.get("projectName") ?? "");
    await call("/api/workspaces/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: props.project.id, name, expectedUpdatedAt: props.project.updatedAt }) }, "project-rename", "Project name updated.");
  }

  async function archiveProject() {
    if (!window.confirm(`Archive ${props.project.name}? History stays available, but the project will stop accepting new actions.`)) return;
    const query = new URLSearchParams({ projectId: props.project.id, expectedUpdatedAt: props.project.updatedAt });
    const result = await call(`/api/workspaces/projects?${query}`, { method: "DELETE" }, "project-archive", "Project archived. Select another active project to continue.");
    if (result) router.push(props.embedded ? "/dashboard/settings" : "/dashboard/workspace");
  }

  async function createEnvironment(formData: FormData) {
    const name = String(formData.get("environmentName") ?? "");
    const kind = String(formData.get("environmentKind") ?? "custom");
    await call("/api/workspaces/environments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: props.project.id, name, kind }) }, "environment-create", "Environment created.");
  }

  async function renameEnvironment(formData: FormData) {
    const name = String(formData.get("environmentName") ?? "");
    await call("/api/workspaces/environments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: props.project.id, environmentId: props.environment.id, name, expectedUpdatedAt: props.environment.updatedAt }) }, "environment-rename", "Environment name updated.");
  }

  async function archiveEnvironment(environmentId: string) {
    const target = props.environments.find((item) => item.id === environmentId);
    if (!target) return;
    if (!window.confirm(`Archive ${target.name}? Existing decision history remains available according to workspace retention.`)) return;
    const query = new URLSearchParams({ projectId: props.project.id, environmentId, expectedUpdatedAt: target.updatedAt });
    await call(`/api/workspaces/environments?${query}`, { method: "DELETE" }, `environment-${environmentId}`, "Environment archived.");
  }

  async function inviteMember(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    const role = String(formData.get("role") ?? "member");
    const result = await call("/api/workspaces/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) }, "member-invite", "Invitation created. Share the one-time invitation link securely.");
    setInviteUrl(result?.inviteUrl ?? null);
  }

  async function changeRole(userId: string, role: WorkspaceRole) {
    const target = props.members.find((member) => member.userId === userId);
    if (!target) return;
    await call("/api/workspaces/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role, expectedRole: target.role }) }, `role-${userId}`, "Member role updated.");
  }

  async function removeMember(userId: string) {
    const target = props.members.find((member) => member.userId === userId);
    if (!target) return;
    if (!window.confirm("Remove this member from the workspace? They will immediately lose workspace access.")) return;
    const query = new URLSearchParams({ userId, expectedRole: target.role });
    await call(`/api/workspaces/members?${query}`, { method: "DELETE" }, `remove-${userId}`, "Member removed.");
  }

  async function archiveWorkspace() {
    if (!window.confirm(`Archive ${props.workspace.name}? Existing history remains according to retention, but the workspace will no longer accept new work.`)) return;
    const result = await call("/api/workspaces/current", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive", expectedUpdatedAt: props.workspace.updatedAt }) }, "workspace-archive", "Workspace archived.");
    if (result) router.push("/onboarding");
  }

  return (
    <div className="workspaceAdmin">
      {!props.embedded ? <header className="workspaceAdminHeader"><div><p className="vlEyebrow">Organization control</p><h1>{props.workspace.name}</h1><p>Manage the real team boundary behind every VetoLayer policy, decision, review, and integration.</p></div><Badge tone={props.role === "owner" ? "accent" : props.role === "admin" ? "info" : "neutral"}>{props.role}</Badge></header> : <div className="workspaceAdminHeader"><div><p className="vlEyebrow">WORKSPACE & TEAM</p><h2>{props.workspace.name}</h2><p>Identity, people, projects, and environments are persisted workspace state. Editable controls are permission-aware and stale writes are rejected.</p></div><Badge tone={props.role === "owner" ? "accent" : props.role === "admin" ? "info" : "neutral"}>{props.role}</Badge></div>}

      {notice ? <Notice tone={notice.tone} title={notice.title}>{notice.message}</Notice> : null}

      <div className="workspaceAdminGrid">
        <Card raised className="workspaceAdminCard">
          <div className="workspaceSectionHead"><div><span>Workspace</span><h2>Organization identity</h2></div><Badge tone={props.workspace.status === "active" ? "success" : "warning"}>{props.workspace.status}</Badge></div>
          <form action={renameWorkspace} className="workspaceInlineForm">
            <Field label="Workspace name"><Input name="workspaceName" defaultValue={props.workspace.name} disabled={!canManageWorkspace || Boolean(busy)} /></Field>
            <Button type="submit" tone="secondary" disabled={!canManageWorkspace || Boolean(busy)}>Rename</Button>
          </form>
          <dl className="workspaceFacts"><div><dt>Workspace ID</dt><dd>{props.workspace.id}</dd></div><div><dt>Your role</dt><dd>{props.role}</dd></div><div><dt>Members</dt><dd>{canManageMembers ? props.members.length : "Restricted"}</dd></div><div><dt>Projects</dt><dd>{props.projects.length}</dd></div></dl>
          {!props.embedded && props.role === "owner" ? <Button tone="danger" size="sm" onClick={() => void archiveWorkspace()} disabled={Boolean(busy)}>Archive workspace</Button> : null}
        </Card>

        <Card raised className="workspaceAdminCard">
          <div className="workspaceSectionHead"><div><span>Current project</span><h2>{props.project.name}</h2></div><Badge tone={props.project.status === "active" ? "success" : "warning"}>{props.project.status}</Badge></div>
          <form action={renameProject} className="workspaceInlineForm">
            <Field label="Project name"><Input name="projectName" defaultValue={props.project.name} disabled={!canManageProjects || Boolean(busy)} /></Field>
            <Button type="submit" tone="secondary" disabled={!canManageProjects || Boolean(busy)}>Rename</Button>
          </form>
          <div className="workspaceEntityList">{props.projects.map((project) => <div key={project.id}><span><strong>{project.name}</strong><small>{project.id}</small></span>{project.id === props.project.id ? <Badge tone="accent">Selected</Badge> : <Badge>{project.status}</Badge>}</div>)}</div>
          {canManageProjects ? <><form action={createProject} className="workspaceInlineForm workspaceCreateForm"><Field label="New project"><Input name="projectName" placeholder="Payments Agent" /></Field><Button type="submit" tone="primary" disabled={Boolean(busy)}>Create project</Button></form><Button tone="danger" size="sm" onClick={() => void archiveProject()} disabled={Boolean(busy)}>Archive current project</Button></> : null}
        </Card>

        <Card raised className="workspaceAdminCard workspaceAdminWide">
          <div className="workspaceSectionHead"><div><span>Environments</span><h2>{props.project.name} environments</h2></div><Badge>{props.environments.filter((item) => item.status === "active").length} active</Badge></div>
          <div className="workspaceEntityList workspaceEnvironmentList">{props.environments.map((environment) => <div key={environment.id}><span><strong>{environment.name}</strong><small>{environment.kind} · {environment.status} · {environment.id}</small></span><div className="workspaceRowActions">{environment.id === props.environment.id ? <Badge tone="accent">Selected</Badge> : null}{canManageEnvironments && environment.status === "active" ? <Button tone="ghost" size="sm" onClick={() => void archiveEnvironment(environment.id)} disabled={Boolean(busy) || props.environments.filter((item) => item.status === "active").length <= 1}>Archive</Button> : null}</div></div>)}</div>
          {canManageEnvironments ? <div className="workspaceTwoForms"><form action={renameEnvironment} className="workspaceInlineForm"><Field label="Rename selected environment"><Input name="environmentName" defaultValue={props.environment.name} /></Field><Button type="submit" tone="secondary" disabled={Boolean(busy)}>Rename</Button></form><form action={createEnvironment} className="workspaceInlineForm"><Field label="New environment"><Input name="environmentName" placeholder="EU Production" /></Field><Field label="Kind"><Select name="environmentKind" defaultValue="custom"><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option><option value="custom">Custom</option></Select></Field><Button type="submit" tone="primary" disabled={Boolean(busy)}>Add environment</Button></form></div> : null}
        </Card>

        {canManageMembers ? (
          <Card raised className="workspaceAdminCard workspaceAdminWide">
            <div className="workspaceSectionHead"><div><span>Team</span><h2>Members and roles</h2></div><Badge>{props.members.length} members</Badge></div>
            <TableShell><Table><thead><tr><th>Member</th><th>Role</th><th>Joined</th><th aria-label="Actions" /></tr></thead><tbody>{props.members.map((member) => <tr key={member.userId}><td><strong>{member.displayName ?? member.email ?? member.userId}</strong>{member.displayName && member.email ? <small>{member.email}</small> : null}</td><td>{member.role !== "owner" ? <Select value={member.role} onChange={(event) => void changeRole(member.userId, event.target.value as WorkspaceRole)} disabled={Boolean(busy)}>{props.role === "owner" ? <option value="admin">Admin</option> : null}<option value="reviewer">Reviewer</option><option value="member">Member</option></Select> : <Badge tone="accent">owner</Badge>}</td><td>{new Date(member.joinedAt).toLocaleDateString()}</td><td>{member.role !== "owner" ? <Button tone="ghost" size="sm" onClick={() => void removeMember(member.userId)} disabled={Boolean(busy)}>Remove</Button> : null}</td></tr>)}</tbody></Table></TableShell>
            <form action={inviteMember} className="workspaceInviteForm"><Field label="Invite by email"><Input name="email" type="email" placeholder="reviewer@company.com" required /></Field><Field label="Role"><Select name="role" defaultValue="reviewer">{props.role === "owner" ? <option value="admin">Admin</option> : null}<option value="reviewer">Reviewer</option><option value="member">Member</option></Select></Field><Button type="submit" tone="primary" disabled={Boolean(busy)}>Create invitation</Button></form>
            {inviteUrl ? <Notice tone="success" title="Invitation link created"><span className="workspaceInviteLink">{inviteUrl}</span><br /><Button tone="ghost" size="sm" type="button" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copy invitation link</Button></Notice> : null}
            {props.invitations.length ? <div className="workspaceInvites"><span>Recent invitations</span>{props.invitations.map((invitation) => <div key={invitation.id}><strong>{invitation.email}</strong><small>{invitation.role} · {invitation.status} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></div>)}</div> : null}
          </Card>
        ) : (
          <Card raised className="workspaceAdminCard workspaceAdminWide"><div className="workspaceSectionHead"><div><span>Team</span><h2>Membership is admin-managed</h2></div><Badge>{props.role}</Badge></div><p className="muted">Your role can operate within this workspace but cannot enumerate, invite, remove, or change other members. Owner and Admin roles manage team membership.</p></Card>
        )}
      </div>
    </div>
  );
}

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { WorkspaceRole } from "../../../../lib/workspace-model";
import { canAssignWorkspaceRole } from "../../../../lib/workspace-model";
import { resolveAppOrigin } from "../../../../lib/server/app-origin";
import { requireApiWorkspace } from "../../../../lib/server/api-auth";
import { recordAuditEvent, workspaceAuditInput } from "../../../../lib/server/audit";
import { getWorkspaceStore } from "../../../../lib/server/workspace-store";

const inviteRoles = new Set<Exclude<WorkspaceRole, "owner">>(["admin", "reviewer", "member"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

export async function GET() {
  const auth = await requireApiWorkspace("members.manage");
  if (!auth.ok) return auth.response;
  const { store } = getWorkspaceStore();
  const [members, invitations] = await Promise.all([store.listMembers(auth.workspace.workspaceId), store.listInvitations(auth.workspace.workspaceId)]);
  return NextResponse.json({ members, invitations: invitations.map(({ tokenHash: _tokenHash, ...invitation }) => invitation) });
}

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("members.manage");
  if (!auth.ok) return auth.response;
  let payload: { email?: unknown; role?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const role = typeof payload.role === "string" && inviteRoles.has(payload.role as Exclude<WorkspaceRole, "owner">) ? payload.role as Exclude<WorkspaceRole, "owner"> : "member";
  if (!emailPattern.test(email)) return NextResponse.json({ error: { code: "INVALID_EMAIL", message: "Enter a valid email address." } }, { status: 400 });
  if (!canAssignWorkspaceRole(auth.workspace.role, role)) return NextResponse.json({ error: { code: "ROLE_FORBIDDEN", message: "Your role cannot assign that workspace role." } }, { status: 403 });
  const { store } = getWorkspaceStore();
  const existingMember = (await store.listMembers(auth.workspace.workspaceId)).find((member) => member.email?.toLowerCase() === email);
  if (existingMember) return NextResponse.json({ error: { code: "ALREADY_MEMBER", message: "That email already belongs to this workspace." } }, { status: 409 });
  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date();
  const invitation = { id: `inv_${randomUUID()}`, workspaceId: auth.workspace.workspaceId, email, role, tokenHash: hashToken(token), status: "pending" as const, invitedByUserId: auth.workspace.userId, expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), createdAt: createdAt.toISOString() };
  await store.saveInvitation(invitation);
  await recordAuditEvent(workspaceAuditInput(auth.workspace, { action: "member.invite", category: "member", targetType: "workspace_invitation", targetId: invitation.id, targetLabel: email, href: "/dashboard/settings#workspace", request, metadata: { email, role, expiresAt: invitation.expiresAt } }));
  const requestHeaders = await headers();
  const origin = resolveAppOrigin(requestHeaders.get("origin"));
  const invitePath = `/invite/${encodeURIComponent(token)}`;
  return NextResponse.json({ invitation: { ...invitation, tokenHash: undefined }, inviteUrl: origin ? `${origin}${invitePath}` : invitePath }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiWorkspace("members.manage");
  if (!auth.ok) return auth.response;
  let payload: { userId?: unknown; role?: unknown; expectedRole?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const userId = typeof payload.userId === "string" ? payload.userId : "";
  const role = typeof payload.role === "string" ? payload.role as WorkspaceRole : "member";
  if (!userId || !["admin", "reviewer", "member"].includes(role)) return NextResponse.json({ error: { code: "INVALID_ROLE_CHANGE", message: "Choose a valid member and role." } }, { status: 400 });
  if (!canAssignWorkspaceRole(auth.workspace.role, role)) return NextResponse.json({ error: { code: "ROLE_FORBIDDEN", message: "Your role cannot assign that workspace role." } }, { status: 403 });
  const { store } = getWorkspaceStore();
  const target = await store.getMembership(auth.workspace.workspaceId, userId);
  if (!target) return NextResponse.json({ error: { code: "MEMBER_NOT_FOUND", message: "Member not found." } }, { status: 404 });
  if (typeof payload.expectedRole === "string" && payload.expectedRole !== target.role) return conflict(target);
  if (target.role === "owner") return NextResponse.json({ error: { code: "OWNER_IMMUTABLE", message: "Workspace ownership cannot be changed through a role edit." } }, { status: 409 });
  if (auth.workspace.role === "admin" && target.role === "admin") return NextResponse.json({ error: { code: "ADMIN_FORBIDDEN", message: "Admins cannot change another admin's role." } }, { status: 403 });
  const previousRole = target.role;
  await store.updateMemberRole(auth.workspace.workspaceId, userId, role);
  await recordAuditEvent(workspaceAuditInput(auth.workspace, { action: "member.role.update", category: "member", targetType: "workspace_member", targetId: userId, targetLabel: target.displayName ?? target.email ?? userId, href: "/dashboard/settings#workspace", request, metadata: { previousRole, nextRole: role } }));
  return NextResponse.json({ updated: true, userId, role });
}

export async function DELETE(request: Request) {
  const auth = await requireApiWorkspace("members.manage");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ?? "";
  const expectedRole = url.searchParams.get("expectedRole");
  const { store } = getWorkspaceStore();
  const target = await store.getMembership(auth.workspace.workspaceId, userId);
  if (!target) return NextResponse.json({ error: { code: "MEMBER_NOT_FOUND", message: "Member not found." } }, { status: 404 });
  if (expectedRole && expectedRole !== target.role) return conflict(target);
  if (target.role === "owner") return NextResponse.json({ error: { code: "OWNER_IMMUTABLE", message: "The workspace owner cannot be removed." } }, { status: 409 });
  if (auth.workspace.role === "admin" && target.role === "admin") return NextResponse.json({ error: { code: "ADMIN_FORBIDDEN", message: "Admins cannot remove another admin." } }, { status: 403 });
  await store.removeMember(auth.workspace.workspaceId, userId);
  await recordAuditEvent(workspaceAuditInput(auth.workspace, { action: "member.remove", category: "member", targetType: "workspace_member", targetId: userId, targetLabel: target.displayName ?? target.email ?? userId, href: "/dashboard/settings#workspace", request, metadata: { previousRole: target.role } }));
  return NextResponse.json({ removed: true, userId });
}

function conflict(current: WorkspaceMember) {
  return NextResponse.json({ error: { code: "SETTINGS_CONFLICT", message: "This member changed after the page was loaded. Refresh and review the current role before saving again." }, current }, { status: 409 });
}

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ENVIRONMENT_COOKIE, PROJECT_COOKIE, WORKSPACE_COOKIE, getAuthenticatedIdentity } from "../../../../lib/server/workspace";
import { getWorkspaceStore } from "../../../../lib/server/workspace-store";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in with the invited email address first." } }, { status: 401 });
  const { token } = await context.params;
  const { store } = getWorkspaceStore();
  const invitation = await store.getInvitationByTokenHash(hashToken(token));
  if (!invitation || invitation.status !== "pending") return NextResponse.json({ error: { code: "INVITATION_INVALID", message: "This invitation is no longer available." } }, { status: 404 });
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    await store.updateInvitation({ ...invitation, status: "expired" });
    return NextResponse.json({ error: { code: "INVITATION_EXPIRED", message: "This invitation has expired. Ask a workspace admin for a new one." } }, { status: 410 });
  }
  if (!identity.email || identity.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return NextResponse.json({ error: { code: "INVITATION_EMAIL_MISMATCH", message: `Sign in as ${invitation.email} to accept this invitation.` } }, { status: 403 });
  }
  const workspace = await store.getWorkspace(invitation.workspaceId);
  if (!workspace || workspace.status !== "active") return NextResponse.json({ error: { code: "WORKSPACE_UNAVAILABLE", message: "The invited workspace is no longer active." } }, { status: 409 });

  const joinedAt = new Date().toISOString();
  await store.upsertMember({
    workspaceId: invitation.workspaceId,
    userId: identity.userId,
    email: identity.email,
    ...(identity.displayName ? { displayName: identity.displayName } : {}),
    role: invitation.role,
    status: "active",
    joinedAt,
  });
  await store.updateInvitation({ ...invitation, status: "accepted", acceptedAt: joinedAt });

  const projects = await store.listProjects(invitation.workspaceId);
  const project = projects[0];
  if (!project) return NextResponse.json({ error: { code: "PROJECT_REQUIRED", message: "The workspace has no active project." } }, { status: 409 });
  const environments = await store.listEnvironments(invitation.workspaceId, project.id);
  const environment = environments.find((candidate) => candidate.kind === "production") ?? environments[0];
  if (!environment) return NextResponse.json({ error: { code: "ENVIRONMENT_REQUIRED", message: "The workspace project has no active environment." } }, { status: 409 });

  const cookieStore = await cookies();
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };
  cookieStore.set(WORKSPACE_COOKIE, workspace.id, options);
  cookieStore.set(PROJECT_COOKIE, project.id, options);
  cookieStore.set(ENVIRONMENT_COOKIE, environment.id, options);
  return NextResponse.json({ accepted: true, workspace, project, environment, role: invitation.role });
}

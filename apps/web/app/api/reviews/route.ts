import { NextResponse } from "next/server";
import { requireApiWorkspace } from "../../../lib/server/api-auth";
import { getReviewStore } from "../../../lib/server/review-store";
import { getWorkspaceStore } from "../../../lib/server/workspace-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiWorkspace("reviews.read");
  if (!auth.ok) return auth.response;
  const { store, persistence } = getReviewStore();
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const owner = url.searchParams.get("owner");

  try {
    const cases = await store.list(auth.workspace.workspaceId, { projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId });
    const filtered = cases.filter((item) => {
      if (status && status !== "all" && item.status !== status) return false;
      if (owner === "mine" && item.assignment?.userId !== auth.workspace.userId) return false;
      if (owner === "unassigned" && item.assignment) return false;
      return true;
    });
    const { store: workspaceStore } = getWorkspaceStore();
    const members = (await workspaceStore.listMembers(auth.workspace.workspaceId))
      .filter((member) => member.status === "active" && ["owner", "admin", "reviewer"].includes(member.role))
      .map((member) => ({ userId: member.userId, displayName: member.displayName, email: member.email, role: member.role }));

    return NextResponse.json({
      cases: filtered,
      members,
      currentUserId: auth.workspace.userId,
      persistence,
      scope: { workspaceId: auth.workspace.workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId },
    });
  } catch (error) {
    return NextResponse.json({ error: "REVIEW_STORE_UNAVAILABLE", message: error instanceof Error ? error.message : "Review queue is unavailable." }, { status: 503 });
  }
}

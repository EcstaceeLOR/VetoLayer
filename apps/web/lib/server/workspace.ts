import { createSupabaseServerClient, isSupabaseAuthConfigured } from "../supabase/server";

export type WorkspaceContext = {
  userId: string;
  email?: string;
  displayName?: string;
  workspaceId: string;
  label: string;
};

export function workspaceIdForUser(userId: string) {
  const normalized = userId.trim();
  if (!normalized) throw new Error("userId is required to derive a workspace");
  return `user:${normalized}`;
}

export async function getAuthenticatedWorkspace(): Promise<WorkspaceContext | null> {
  if (!isSupabaseAuthConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const email = user.email?.trim() || undefined;
  const rawDisplayName = user.user_metadata?.display_name;
  const displayName = typeof rawDisplayName === "string" && rawDisplayName.trim() ? rawDisplayName.trim() : undefined;
  return {
    userId: user.id,
    ...(email ? { email } : {}),
    ...(displayName ? { displayName } : {}),
    workspaceId: workspaceIdForUser(user.id),
    label: email ? workspaceLabelFromEmail(email) : "Personal workspace",
  };
}

export function workspaceLabelFromEmail(email: string) {
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return "Personal workspace";

  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

  return words.length ? `${words.join(" ")} Workspace` : "Personal workspace";
}

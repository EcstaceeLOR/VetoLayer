"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidEmail, sanitizeDisplayName, validateNewPassword } from "../../lib/auth/ux";
import { resolveAppOrigin } from "../../lib/server/app-origin";
import { recordUserSecurityAudit } from "../../lib/server/audit";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function accountRedirect(params: Record<string, string>): never {
  const query = new URLSearchParams(params);
  redirect(`/account?${query.toString()}`);
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?error=session_expired&next=/account");
  return { supabase, user };
}

async function requireCurrentPassword(email: string | undefined, password: string) {
  if (!email || !password) accountRedirect({ error: "reauthentication_failed" });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) accountRedirect({ error: "reauthentication_failed" });
  return supabase;
}

function identityFromUser(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  const displayName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : undefined;
  return { userId: user.id, ...(user.email ? { email: user.email } : {}), ...(displayName ? { displayName } : {}) };
}

export async function updateProfile(formData: FormData) {
  const displayName = sanitizeDisplayName(String(formData.get("displayName") ?? ""));
  if (!displayName) accountRedirect({ error: "profile_update_failed" });

  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
  if (error) accountRedirect({ error: "profile_update_failed" });
  accountRedirect({ message: "profile_saved" });
}

export async function changeEmail(formData: FormData) {
  const nextEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (!isValidEmail(nextEmail) || !currentPassword) accountRedirect({ error: "email_change_failed" });

  const { user } = await requireUser();
  if (user.email?.toLowerCase() === nextEmail) accountRedirect({ message: "profile_saved" });

  const supabase = await requireCurrentPassword(user.email, currentPassword);
  const requestHeaders = await headers();
  const origin = resolveAppOrigin(requestHeaders.get("origin"));
  const { error } = await supabase.auth.updateUser(
    { email: nextEmail },
    origin ? { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/account?message=email_confirmation_sent")}` } : undefined,
  );
  if (error) accountRedirect({ error: "email_change_failed" });
  await recordUserSecurityAudit({ ...identityFromUser(user), action: "security.email_change.requested", metadata: { previousEmail: user.email ?? null, nextEmail } });
  accountRedirect({ message: "email_confirmation_sent" });
}

export async function changePassword(formData: FormData) {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const nextPassword = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  const validationError = validateNewPassword(nextPassword, confirmation);
  if (!currentPassword) accountRedirect({ error: "reauthentication_failed" });
  if (validationError) accountRedirect({ error: validationError });

  const { user } = await requireUser();
  const supabase = await requireCurrentPassword(user.email, currentPassword);
  const { error } = await supabase.auth.updateUser({ password: nextPassword });
  if (error) accountRedirect({ error: "password_change_failed" });

  await supabase.auth.signOut({ scope: "others" });
  await recordUserSecurityAudit({ ...identityFromUser(user), action: "security.password.change", metadata: { otherSessionsRevoked: true } });
  accountRedirect({ message: "password_changed" });
}

export async function signOutOtherSessions() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) accountRedirect({ error: "session_action_failed" });
  await recordUserSecurityAudit({ ...identityFromUser(user), action: "security.sessions.sign_out_others" });
  accountRedirect({ message: "other_sessions_signed_out" });
}

export async function signOutEverywhere() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (!error) await recordUserSecurityAudit({ ...identityFromUser(user), action: "security.sessions.sign_out_all" });
  redirect("/login?message=signed_out");
}

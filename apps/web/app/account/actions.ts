"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidEmail, sanitizeDisplayName, validateNewPassword } from "../../lib/auth/ux";
import { resolveAppOrigin } from "../../lib/server/app-origin";
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
  accountRedirect({ message: "password_changed" });
}

export async function signOutOtherSessions() {
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) accountRedirect({ error: "session_action_failed" });
  accountRedirect({ message: "other_sessions_signed_out" });
}

export async function signOutEverywhere() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?message=signed_out");
}

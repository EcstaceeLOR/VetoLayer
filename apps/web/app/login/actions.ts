"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidEmail, sanitizeDisplayName, validateNewPassword } from "../../lib/auth/ux";
import { resolveAppOrigin, safeAppPath } from "../../lib/server/app-origin";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeAppPath(String(formData.get("next") ?? "/dashboard"));
  return { email, password, next };
}

function loginRedirect(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  redirect(`/login?${query.toString()}`);
}

export async function signIn(formData: FormData) {
  const { email, password, next } = readCredentials(formData);
  if (!isValidEmail(email) || !password) loginRedirect({ error: "invalid_credentials", next, mode: "signin" });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) loginRedirect({ error: "sign_in_failed", next, mode: "signin" });

  redirect(next);
}

export async function signUp(formData: FormData) {
  const { email, password, next } = readCredentials(formData);
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  const displayName = sanitizeDisplayName(String(formData.get("displayName") ?? ""));
  const passwordError = validateNewPassword(password, confirmation);

  if (!isValidEmail(email) || !displayName || passwordError) {
    loginRedirect({ error: passwordError ?? "signup_requirements", next, mode: "signup" });
  }

  const requestHeaders = await headers();
  const origin = resolveAppOrigin(requestHeaders.get("origin"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      ...(origin ? { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } : {}),
    },
  });

  if (error) loginRedirect({ error: "sign_up_failed", next, mode: "signup" });
  if (data.session) redirect(next);

  redirect(`/verify-email?message=check_email&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?message=signed_out");
}

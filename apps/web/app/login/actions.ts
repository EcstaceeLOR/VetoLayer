"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAppOrigin, safeAppPath } from "../../lib/server/app-origin";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
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
  if (!email || password.length < 6) {
    loginRedirect({ error: "invalid_credentials", next });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) loginRedirect({ error: "sign_in_failed", next });

  redirect(next);
}

export async function signUp(formData: FormData) {
  const { email, password, next } = readCredentials(formData);
  if (!email || password.length < 8) {
    loginRedirect({ error: "signup_requirements", next });
  }

  const requestHeaders = await headers();
  const origin = resolveAppOrigin(requestHeaders.get("origin"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: origin
      ? { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` }
      : undefined,
  });

  if (error) loginRedirect({ error: "sign_up_failed", next });
  if (data.session) redirect(next);

  loginRedirect({ message: "check_email", next });
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

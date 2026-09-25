"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidEmail } from "../../lib/auth/ux";
import { resolveAppOrigin } from "../../lib/server/app-origin";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) redirect("/forgot-password?error=invalid_credentials");

  const requestHeaders = await headers();
  const origin = resolveAppOrigin(requestHeaders.get("origin"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    ...(origin ? { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}` } : {}),
  });

  if (error) redirect("/forgot-password?error=recovery_failed");
  redirect(`/forgot-password?message=recovery_sent&email=${encodeURIComponent(email)}`);
}

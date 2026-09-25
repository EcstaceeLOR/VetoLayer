"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidEmail } from "../../lib/auth/ux";
import { resolveAppOrigin, safeAppPath } from "../../lib/server/app-origin";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export async function resendVerification(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeAppPath(String(formData.get("next") ?? "/dashboard"));
  if (!isValidEmail(email)) redirect(`/verify-email?error=invalid_credentials&next=${encodeURIComponent(next)}`);

  const requestHeaders = await headers();
  const origin = resolveAppOrigin(requestHeaders.get("origin"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: origin
      ? { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` }
      : undefined,
  });

  if (error) redirect(`/verify-email?error=verification_failed&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  redirect(`/verify-email?message=verification_sent&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
}

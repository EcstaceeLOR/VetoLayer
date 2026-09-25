"use server";

import { redirect } from "next/navigation";
import { validateNewPassword } from "../../lib/auth/ux";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export async function resetPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  const validationError = validateNewPassword(password, confirmation);
  if (validationError) redirect(`/reset-password?error=${validationError}`);

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/reset-password?error=recovery_session_required");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=reset_failed");

  await supabase.auth.signOut({ scope: "others" });
  redirect("/account?message=password_reset");
}

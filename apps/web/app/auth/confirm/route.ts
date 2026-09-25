import { NextResponse } from "next/server";
import { resolveAppOrigin, safeAppPath } from "../../../lib/server/app-origin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const allowedTypes = ["email", "signup", "invite", "magiclink", "recovery", "email_change"] as const;
type AllowedEmailOtpType = (typeof allowedTypes)[number];

function parseEmailOtpType(value: string | null): AllowedEmailOtpType | null {
  return allowedTypes.includes(value as AllowedEmailOtpType) ? (value as AllowedEmailOtpType) : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = parseEmailOtpType(url.searchParams.get("type"));
  const next = safeAppPath(url.searchParams.get("next"));
  const origin = resolveAppOrigin(url.origin) ?? url.origin;
  const recovery = type === "recovery";

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL(recovery ? "/forgot-password?error=link_expired" : `/verify-email?error=link_expired&next=${encodeURIComponent(next)}`, origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(new URL(recovery ? "/forgot-password?error=link_expired" : `/verify-email?error=link_expired&next=${encodeURIComponent(next)}`, origin));
  }

  const destination = recovery ? "/reset-password" : next;
  return NextResponse.redirect(new URL(destination, origin));
}

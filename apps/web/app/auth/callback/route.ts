import { NextResponse } from "next/server";
import { resolveAppOrigin, safeAppPath } from "../../../lib/server/app-origin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeAppPath(url.searchParams.get("next"));
  const origin = resolveAppOrigin(url.origin) ?? url.origin;
  const recovery = next === "/reset-password";

  if (!code || url.searchParams.get("error")) {
    return NextResponse.redirect(
      new URL(recovery ? "/forgot-password?error=link_expired" : `/verify-email?error=link_expired&next=${encodeURIComponent(next)}`, origin),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(recovery ? "/forgot-password?error=link_expired" : `/verify-email?error=link_expired&next=${encodeURIComponent(next)}`, origin),
    );
  }

  return NextResponse.redirect(new URL(next, origin));
}

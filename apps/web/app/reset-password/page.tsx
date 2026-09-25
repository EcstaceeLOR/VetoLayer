import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSubmitButton } from "../../components/auth-submit-button";
import { Card, Field, Input, Notice } from "../../components/ui/primitives";
import { VetoLayerLogo } from "../../components/vetolayer-logo";
import { authErrorMessage, MIN_PASSWORD_LENGTH } from "../../lib/auth/ux";
import { createSupabaseServerClient, isSupabaseAuthConfigured } from "../../lib/supabase/server";
import { resetPassword } from "./actions";
import "../login/login.css";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const configured = isSupabaseAuthConfigured();
  if (!configured) redirect("/login?error=auth_not_configured");

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const error = authErrorMessage(params.error ?? (!user ? "recovery_session_required" : undefined));

  return (
    <main className="authShell" id="main-content" tabIndex={-1}>
      <div className="authFrame authFrameCompact">
        <Link href="/" className="brand authBrand" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link>
        <section className="authIntro">
          <p className="vlEyebrow">Secure password reset</p>
          <h1>Replace the credential. Keep the account.</h1>
          <p>The newest recovery email establishes the recovery session required to set a new password. Other active sessions are revoked after a successful reset.</p>
        </section>

        <Card className="authCard" raised>
          {error ? <Notice tone="danger" title={user ? "Password could not be updated" : "Recovery link required"} role="alert">{error}</Notice> : null}
          {user ? (
            <form className="authForm" action={resetPassword}>
              <Field label="New password" hint={`Use at least ${MIN_PASSWORD_LENGTH} characters.`}>
                <Input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
              </Field>
              <Field label="Confirm new password">
                <Input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
              </Field>
              <AuthSubmitButton pendingLabel="Updating password…">Set new password</AuthSubmitButton>
            </form>
          ) : (
            <div className="authRecoveryActions">
              <Link className="vlButton vlButtonPrimary" href="/forgot-password">Request a new reset link</Link>
              <Link className="vlButton vlButtonSecondary" href="/login">Back to sign in</Link>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

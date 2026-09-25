import Link from "next/link";
import { AuthSubmitButton } from "../../components/auth-submit-button";
import { Card, Field, Input, Notice } from "../../components/ui/primitives";
import { VetoLayerLogo } from "../../components/vetolayer-logo";
import { authErrorMessage, authSuccessMessage } from "../../lib/auth/ux";
import { isSupabaseAuthConfigured } from "../../lib/supabase/server";
import { requestPasswordReset } from "./actions";
import "../login/login.css";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; email?: string }>;
}) {
  const params = await searchParams;
  const configured = isSupabaseAuthConfigured();
  const error = authErrorMessage(params.error);
  const message = authSuccessMessage(params.message);

  return (
    <main className="authShell" id="main-content" tabIndex={-1}>
      <div className="authFrame authFrameCompact">
        <Link href="/" className="brand authBrand" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link>
        <section className="authIntro">
          <p className="vlEyebrow">Account recovery</p>
          <h1>Recover access without developer help.</h1>
          <p>We will send a short-lived recovery link to the account email. For privacy, the success response is the same whether or not the address exists.</p>
        </section>

        <Card className="authCard" raised>
          {error ? <Notice tone="danger" title="Recovery could not start" role="alert">{error}</Notice> : null}
          {message ? <Notice tone="success" title="Check your email" role="status">{message}</Notice> : null}
          <form className="authForm" action={requestPasswordReset}>
            <Field label="Account email">
              <Input name="email" type="email" autoComplete="email" defaultValue={params.email ?? ""} required disabled={!configured} placeholder="you@company.com" />
            </Field>
            <AuthSubmitButton pendingLabel="Sending reset link…">Send password reset</AuthSubmitButton>
          </form>
          <div className="authInlineLinks authInlineLinksFooter">
            <Link href="/login">Back to sign in</Link>
            <Link href="/verify-email">Need a verification email?</Link>
          </div>
        </Card>
      </div>
    </main>
  );
}

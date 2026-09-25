import Link from "next/link";
import { AuthSubmitButton } from "../../components/auth-submit-button";
import { Card, Field, Input, Notice } from "../../components/ui/primitives";
import { VetoLayerLogo } from "../../components/vetolayer-logo";
import { authErrorMessage, authSuccessMessage } from "../../lib/auth/ux";
import { safeAppPath } from "../../lib/server/app-origin";
import { isSupabaseAuthConfigured } from "../../lib/supabase/server";
import { resendVerification } from "./actions";
import "../login/login.css";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; email?: string; next?: string }>;
}) {
  const params = await searchParams;
  const configured = isSupabaseAuthConfigured();
  const next = safeAppPath(params.next);
  const error = authErrorMessage(params.error);
  const message = authSuccessMessage(params.message ?? "check_email");

  return (
    <main className="authShell" id="main-content" tabIndex={-1}>
      <div className="authFrame authFrameCompact">
        <Link href="/" className="brand authBrand" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link>
        <section className="authIntro">
          <p className="vlEyebrow">Verify your identity</p>
          <h1>One verified address. One accountable owner.</h1>
          <p>Email verification protects workspace ownership and gives recovery/security changes a trusted destination.</p>
        </section>

        <Card className="authCard" raised>
          {error ? <Notice tone="danger" title="Verification email unavailable" role="alert">{error}</Notice> : null}
          {message ? <Notice tone="success" title="Check your inbox" role="status">{message}</Notice> : null}
          <form className="authForm" action={resendVerification}>
            <input type="hidden" name="next" value={next} />
            <Field label="Account email" hint="Use the address you entered when creating the account.">
              <Input name="email" type="email" autoComplete="email" defaultValue={params.email ?? ""} required disabled={!configured} placeholder="you@company.com" />
            </Field>
            <AuthSubmitButton pendingLabel="Sending verification…">Resend verification email</AuthSubmitButton>
          </form>
          <div className="authInlineLinks authInlineLinksFooter">
            <Link href={`/login?mode=signin&next=${encodeURIComponent(next)}`}>Back to sign in</Link>
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
        </Card>
      </div>
    </main>
  );
}

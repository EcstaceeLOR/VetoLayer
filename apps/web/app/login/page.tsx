import Link from "next/link";
import { AuthSubmitButton } from "../../components/auth-submit-button";
import { Badge, Card, Field, Input, Notice } from "../../components/ui/primitives";
import { VetoLayerLogo } from "../../components/vetolayer-logo";
import { authErrorMessage, authSuccessMessage, MIN_PASSWORD_LENGTH } from "../../lib/auth/ux";
import { safeAppPath } from "../../lib/server/app-origin";
import { isSupabaseAuthConfigured } from "../../lib/supabase/server";
import { signIn, signUp } from "./actions";
import "./login.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const next = safeAppPath(params.next);
  const configured = isSupabaseAuthConfigured();
  const signupMode = params.mode === "signup";
  const error = authErrorMessage(params.error);
  const message = authSuccessMessage(params.message);

  return (
    <main className="authShell" id="main-content" tabIndex={-1}>
      <div className="authFrame">
        <Link href="/" className="brand authBrand" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link>
        <section className="authIntro" aria-labelledby="auth-heading">
          <p className="vlEyebrow">Workspace access</p>
          <h1 id="auth-heading">{signupMode ? "Create the account behind your control plane." : "Return to your agent control plane."}</h1>
          <p>{signupMode
            ? "Create a verified VetoLayer identity before policies, decisions, reviews, and integrations are attached to your workspace."
            : "Sign in to the VetoLayer workspace that owns your policies, decisions, review cases, and integration state."}</p>
        </section>

        <Card className="authCard" raised aria-label={signupMode ? "Create a VetoLayer account" : "Sign in to VetoLayer"}>
          <div className="authCardHeader">
            <div><span className="authStatusDot" aria-hidden="true" /> Account security</div>
            <Badge tone={configured ? "success" : "warning"}>{configured ? "Available" : "Needs setup"}</Badge>
          </div>

          <div className="authModeSwitch" aria-label="Authentication mode">
            <Link className={!signupMode ? "active" : ""} href={`/login?mode=signin&next=${encodeURIComponent(next)}`}>Sign in</Link>
            <Link className={signupMode ? "active" : ""} href={`/login?mode=signup&next=${encodeURIComponent(next)}`}>Create account</Link>
          </div>

          {error ? <Notice tone="danger" title="Authentication could not be completed" role="alert">{error}</Notice> : null}
          {message ? <Notice tone="success" title="Account update" role="status">{message}</Notice> : null}

          {signupMode ? (
            <form className="authForm" action={signUp}>
              <input type="hidden" name="next" value={next} />
              <Field label="Display name" hint="Shown to you inside VetoLayer; you can change it later.">
                <Input name="displayName" autoComplete="name" required maxLength={80} placeholder="Ada Lovelace" disabled={!configured} />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" autoComplete="email" required placeholder="you@company.com" disabled={!configured} />
              </Field>
              <Field label="Password" hint={`Use at least ${MIN_PASSWORD_LENGTH} characters.`}>
                <Input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required disabled={!configured} />
              </Field>
              <Field label="Confirm password">
                <Input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required disabled={!configured} />
              </Field>
              <AuthSubmitButton pendingLabel="Creating account…">Create account</AuthSubmitButton>
              <p className="authFinePrint">Email verification may be required before the first sign-in, depending on the production Supabase policy.</p>
            </form>
          ) : (
            <form className="authForm" action={signIn}>
              <input type="hidden" name="next" value={next} />
              <Field label="Email">
                <Input name="email" type="email" autoComplete="email" required placeholder="you@company.com" disabled={!configured} />
              </Field>
              <Field label="Password">
                <Input name="password" type="password" autoComplete="current-password" required disabled={!configured} />
              </Field>
              <div className="authInlineLinks">
                <Link href="/forgot-password">Forgot password?</Link>
                <Link href={`/verify-email?next=${encodeURIComponent(next)}`}>Need a new verification email?</Link>
              </div>
              <AuthSubmitButton pendingLabel="Signing in…">Sign in</AuthSubmitButton>
            </form>
          )}

          {!configured ? <p className="authFinePrint">This deployment still needs its Supabase Auth environment variables before account actions can run.</p> : null}
        </Card>
      </div>
    </main>
  );
}

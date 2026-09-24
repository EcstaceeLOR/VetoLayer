import Link from "next/link";
import { Badge, Button, Card, Field, Input, Notice } from "../../components/ui/primitives";
import { VetoLayerLogo } from "../../components/vetolayer-logo";
import { safeAppPath } from "../../lib/server/app-origin";
import { isSupabaseAuthConfigured } from "../../lib/supabase/server";
import { signIn, signUp } from "./actions";
import "./login.css";

const errorMessages: Record<string, string> = {
  auth_not_configured: "Authentication is not configured on this deployment yet.",
  invalid_credentials: "Enter a valid email and a password with at least 6 characters.",
  signup_requirements: "Use a valid email and a password with at least 8 characters.",
  sign_in_failed: "We could not sign you in with those credentials.",
  sign_up_failed: "We could not create that account. Try signing in if it already exists.",
  callback_failed: "The authentication link could not be verified. Request a new one and try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeAppPath(params.next);
  const configured = isSupabaseAuthConfigured();
  const error = params.error ? errorMessages[params.error] ?? "Authentication could not be completed." : null;
  const message = params.message === "check_email" ? "Check your inbox to confirm your account, then return to VetoLayer." : null;

  return (
    <main className="authShell" id="main-content" tabIndex={-1}>
      <div className="authFrame">
        <Link href="/" className="brand authBrand" aria-label="VetoLayer home"><VetoLayerLogo size="md" /></Link>
        <section className="authIntro" aria-labelledby="auth-heading">
          <p className="vlEyebrow">Workspace access</p>
          <h1 id="auth-heading">Own the decisions your agents make.</h1>
          <p>Sign in to a private VetoLayer workspace. Policies, decisions, review cases, and integration state stay scoped to the authenticated owner.</p>
        </section>

        <Card className="authCard" raised aria-label="Sign in or create an account">
          <div className="authCardHeader">
            <div><span className="authStatusDot" aria-hidden="true" /> Supabase Auth</div>
            <Badge tone={configured ? "success" : "warning"}>{configured ? "Configured" : "Needs setup"}</Badge>
          </div>

          {error ? <Notice tone="danger" title="Authentication unavailable" role="alert">{error}</Notice> : null}
          {message ? <Notice tone="success" title="Check your email" role="status">{message}</Notice> : null}

          <form className="authForm">
            <input type="hidden" name="next" value={next} />
            <Field label="Email">
              <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" disabled={!configured} />
            </Field>
            <Field label="Password" hint="Use the password associated with your VetoLayer account.">
              <Input id="password" name="password" type="password" autoComplete="current-password" minLength={6} required placeholder="••••••••" disabled={!configured} />
            </Field>
            <div className="authActions">
              <Button tone="primary" size="lg" formAction={signIn} disabled={!configured}>Sign in</Button>
              <Button tone="secondary" size="lg" formAction={signUp} disabled={!configured}>Create account</Button>
            </div>
          </form>

          <p className="authFinePrint">VetoLayer uses Supabase-hosted authentication. Workspace identity is verified server-side before protected data is read or written.</p>
        </Card>
      </div>
    </main>
  );
}

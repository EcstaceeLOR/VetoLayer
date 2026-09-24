import Link from "next/link";
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
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/dashboard";
  const configured = isSupabaseAuthConfigured();
  const error = params.error ? errorMessages[params.error] ?? "Authentication could not be completed." : null;
  const message = params.message === "check_email" ? "Check your inbox to confirm your account, then return to VetoLayer." : null;

  return (
    <main className="authShell">
      <div className="authFrame">
        <Link href="/" className="brand authBrand"><span className="mark">V</span> VetoLayer</Link>
        <section className="authIntro">
          <p className="eyebrow">WORKSPACE ACCESS</p>
          <h1>Own the decisions your agents make.</h1>
          <p>Sign in to a private VetoLayer workspace. Policies, decisions, review cases, and integration state stay scoped to the authenticated owner.</p>
        </section>

        <section className="authCard">
          <div className="authCardHeader">
            <div><span className="authStatusDot" /> Supabase Auth</div>
            <span className={configured ? "authState ready" : "authState needsConfig"}>{configured ? "Configured" : "Needs setup"}</span>
          </div>

          {error ? <div className="authNotice error" role="alert">{error}</div> : null}
          {message ? <div className="authNotice success" role="status">{message}</div> : null}

          <form className="authForm">
            <input type="hidden" name="next" value={next} />
            <label>
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" required placeholder="you@company.com" disabled={!configured} />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" minLength={6} required placeholder="••••••••" disabled={!configured} />
            </label>
            <div className="authActions">
              <button className="authPrimary" formAction={signIn} disabled={!configured}>Sign in</button>
              <button className="authSecondary" formAction={signUp} disabled={!configured}>Create account</button>
            </div>
          </form>

          <p className="authFinePrint">VetoLayer uses Supabase-hosted authentication. Workspace identity is verified server-side before protected data is read or written.</p>
        </section>
      </div>
    </main>
  );
}

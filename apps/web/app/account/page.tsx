import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSubmitButton } from "../../components/auth-submit-button";
import { Badge, Card, Field, Input, Notice } from "../../components/ui/primitives";
import { VetoLayerLogo } from "../../components/vetolayer-logo";
import { authErrorMessage, authSuccessMessage, MIN_PASSWORD_LENGTH } from "../../lib/auth/ux";
import { createSupabaseServerClient, isSupabaseAuthConfigured } from "../../lib/supabase/server";
import { changeEmail, changePassword, signOutEverywhere, signOutOtherSessions, updateProfile } from "./actions";
import "./security.css";

export const dynamic = "force-dynamic";

function formatTimestamp(value?: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  if (!isSupabaseAuthConfigured()) redirect("/login?error=auth_not_configured&next=/account");

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login?error=session_expired&next=/account");

  const params = await searchParams;
  const error = authErrorMessage(params.error);
  const message = authSuccessMessage(params.message);
  const displayName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";
  const emailVerified = Boolean(user.email_confirmed_at);

  return (
    <main className="accountShell" id="main-content" tabIndex={-1}>
      <header className="accountHeader">
        <Link href="/dashboard" className="brand" aria-label="Back to VetoLayer control center"><VetoLayerLogo size="md" /></Link>
        <Link className="vlButton vlButtonSecondary vlButtonSm" href="/dashboard">Back to control center</Link>
      </header>

      <div className="accountTitleRow">
        <div><p className="vlEyebrow">Account & security</p><h1>Identity behind the decisions.</h1><p>Manage the verified account that owns this VetoLayer workspace and its active sessions.</p></div>
        <Badge tone={emailVerified ? "success" : "warning"}>{emailVerified ? "Email verified" : "Verification pending"}</Badge>
      </div>

      {error ? <Notice tone="danger" title="Account change could not be completed" role="alert">{error}</Notice> : null}
      {message ? <Notice tone="success" title="Account updated" role="status">{message}</Notice> : null}

      <section className="accountMetaGrid" aria-label="Account status">
        <Card><span>Email</span><strong>{user.email ?? "No email"}</strong><small>{emailVerified ? `Verified ${formatTimestamp(user.email_confirmed_at)}` : "Verification required"}</small></Card>
        <Card><span>Last sign in</span><strong>{formatTimestamp(user.last_sign_in_at)}</strong><small>Supabase-authenticated session</small></Card>
        <Card><span>Account created</span><strong>{formatTimestamp(user.created_at)}</strong><small>Identity ID {user.id.slice(0, 8)}…</small></Card>
      </section>

      <div className="accountGrid">
        <Card className="accountSection" raised>
          <div className="accountSectionHead"><div><p className="vlEyebrow">Profile</p><h2>Your display identity</h2></div><Badge tone="neutral">Safe change</Badge></div>
          <p>Display name is shown in the VetoLayer shell. It does not change your workspace ownership identifier.</p>
          <form action={updateProfile} className="accountForm">
            <Field label="Display name"><Input name="displayName" autoComplete="name" maxLength={80} required defaultValue={displayName} placeholder="Your name" /></Field>
            <AuthSubmitButton pendingLabel="Saving profile…">Save profile</AuthSubmitButton>
          </form>
        </Card>

        <Card className="accountSection" raised>
          <div className="accountSectionHead"><div><p className="vlEyebrow">Sign-in email</p><h2>Change your email</h2></div><Badge tone="warning">Re-auth required</Badge></div>
          <p>We verify your current password before requesting an email change. Supabase may require confirmation from both the old and new address.</p>
          <form action={changeEmail} className="accountForm">
            <Field label="New email"><Input name="email" type="email" autoComplete="email" required placeholder="new@company.com" /></Field>
            <Field label="Current password"><Input name="currentPassword" type="password" autoComplete="current-password" required /></Field>
            <AuthSubmitButton pendingLabel="Starting email change…">Change email</AuthSubmitButton>
          </form>
        </Card>

        <Card className="accountSection" raised>
          <div className="accountSectionHead"><div><p className="vlEyebrow">Password</p><h2>Change your password</h2></div><Badge tone="warning">Re-auth required</Badge></div>
          <p>Changing the password requires your current password and revokes other sessions after the update succeeds.</p>
          <form action={changePassword} className="accountForm">
            <Field label="Current password"><Input name="currentPassword" type="password" autoComplete="current-password" required /></Field>
            <Field label="New password" hint={`Use at least ${MIN_PASSWORD_LENGTH} characters.`}><Input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required /></Field>
            <Field label="Confirm new password"><Input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required /></Field>
            <AuthSubmitButton pendingLabel="Changing password…">Change password</AuthSubmitButton>
          </form>
        </Card>

        <Card className="accountSection sessionSection" raised>
          <div className="accountSectionHead"><div><p className="vlEyebrow">Sessions</p><h2>Control where you are signed in</h2></div><Badge tone="info">Session security</Badge></div>
          <p>Revoke every other refresh-token session while keeping this browser active, or sign out everywhere including this device.</p>
          <div className="sessionActions">
            <form action={signOutOtherSessions}><AuthSubmitButton pendingLabel="Revoking sessions…" tone="secondary">Sign out other sessions</AuthSubmitButton></form>
            <form action={signOutEverywhere}><AuthSubmitButton pendingLabel="Signing out everywhere…" tone="danger">Sign out everywhere</AuthSubmitButton></form>
          </div>
        </Card>
      </div>
    </main>
  );
}

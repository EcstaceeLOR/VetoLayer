# VetoLayer production authentication

VetoLayer uses Supabase Auth through `@supabase/ssr`, with sessions stored in HTTP cookies and refreshed by the Next.js proxy.

## Required application variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=https://YOUR_VETOLAYER_DOMAIN
```

The publishable key is browser-safe. Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `NEXT_PUBLIC_` variable.

## Supabase URL configuration

In **Authentication → URL Configuration**:

- Site URL: `https://YOUR_VETOLAYER_DOMAIN`
- Add `https://YOUR_VETOLAYER_DOMAIN/auth/callback` to Redirect URLs.
- Add the corresponding localhost callback for local development when needed.

VetoLayer validates post-auth `next` paths and only redirects inside the application origin.

## Email confirmation templates

VetoLayer supports both Supabase PKCE callback links and token-hash email templates.

For a token-hash signup confirmation template, point the confirmation URL at:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding
```

For a token-hash password recovery template, use:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

If the hosted Supabase templates use the standard confirmation URL/PKCE flow, the application handles the returned code through `/auth/callback` instead.

## Email and password security

Recommended hosted configuration:

- Require email verification before normal sign-in.
- Keep Secure email change enabled so email changes require confirmation.
- Use a project password minimum at least as strong as VetoLayer's 10-character UI minimum.
- Enable leaked-password protection when available on the project plan.
- Configure production SMTP before launch. Supabase's default email sender is intended for trial/development traffic and has strict rate limits.

VetoLayer asks for the current password before changing either the sign-in email or password. Password changes and password-recovery resets revoke other refresh-token sessions while keeping the current recovered session active.

## Supported account lifecycle

- Email/password signup with display name
- Email verification and resend
- Password sign-in
- Local/current-session sign-out
- Forgot-password email
- Expired/invalid recovery-link recovery
- Password reset
- Profile/display-name updates
- Email change with current-password reauthentication
- Password change with current-password reauthentication
- Sign out all other sessions
- Sign out everywhere

## Production verification checklist

1. Create a new account using an inbox you control.
2. Confirm the verification email and ensure the callback lands inside VetoLayer.
3. Sign out and sign back in.
4. Request password recovery, open the newest link, and set a new password.
5. Verify the old password no longer signs in.
6. Change display name and confirm the product shell updates.
7. Start an email change and confirm the configured Supabase secure-email-change behavior.
8. Sign in in a second browser, use **Sign out other sessions**, and confirm the second session is revoked on refresh.
9. Use **Sign out everywhere** and confirm the current browser returns to sign-in.

No page should display a raw Supabase provider error; user-visible failures are mapped to stable VetoLayer account messages.

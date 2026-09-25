export const MIN_PASSWORD_LENGTH = 10;

export const authErrorMessages: Record<string, string> = {
  auth_not_configured: "Authentication is not configured on this deployment yet.",
  invalid_credentials: "Enter a valid email address and password.",
  signup_requirements: `Use a valid email address and a password with at least ${MIN_PASSWORD_LENGTH} characters.`,
  password_mismatch: "The two password entries do not match.",
  sign_in_failed: "We could not sign you in with those credentials.",
  sign_up_failed: "We could not create that account right now. Try signing in if you already have an account.",
  callback_failed: "That authentication link could not be verified. Request a new link and try again.",
  link_expired: "That authentication link is invalid or has expired. Request a fresh link and try again.",
  session_expired: "Your session has ended. Sign in again to continue.",
  session_required: "Sign in to continue to that page.",
  verification_failed: "We could not send a new verification email right now. Please try again in a moment.",
  recovery_failed: "We could not start account recovery right now. Please try again in a moment.",
  recovery_session_required: "Open the newest password-reset email first, then set your new password.",
  reset_failed: "We could not update your password. Request a fresh reset link and try again.",
  profile_update_failed: "We could not save your profile changes.",
  reauthentication_failed: "Your current password could not be verified.",
  email_change_failed: "We could not start the email-change process.",
  password_change_failed: "We could not update your password.",
  session_action_failed: "We could not update your active sessions.",
};

export const authSuccessMessages: Record<string, string> = {
  check_email: "Check your inbox to verify your account before signing in.",
  verification_sent: "If that account still needs verification, a fresh verification email is on the way.",
  recovery_sent: "If an account exists for that email, a password-reset link is on the way.",
  password_reset: "Your password has been updated. You can continue securely.",
  profile_saved: "Your profile has been updated.",
  email_confirmation_sent: "Confirm the email-change message to finish updating your sign-in address.",
  password_changed: "Your password has been changed.",
  other_sessions_signed_out: "Other signed-in sessions have been revoked. This session remains active.",
  signed_out: "You have been signed out of this session.",
};

export function authErrorMessage(code?: string | null) {
  if (!code) return null;
  return authErrorMessages[code] ?? "Authentication could not be completed. Please try again.";
}

export function authSuccessMessage(code?: string | null) {
  if (!code) return null;
  return authSuccessMessages[code] ?? null;
}

export function isValidEmail(value: string) {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateNewPassword(password: string, confirmation?: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return "signup_requirements";
  if (confirmation !== undefined && password !== confirmation) return "password_mismatch";
  return null;
}

export function sanitizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

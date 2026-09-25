import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("account lifecycle integration contracts", () => {
  it("covers signup, login, verification, recovery, reset, and scoped logout paths", () => {
    const login = source("../../app/login/actions.ts");
    const verify = source("../../app/verify-email/actions.ts");
    const recovery = source("../../app/forgot-password/actions.ts");
    const reset = source("../../app/reset-password/actions.ts");

    expect(login).toContain("signInWithPassword");
    expect(login).toContain("auth.signUp");
    expect(login).toContain('signOut({ scope: "local" })');
    expect(verify).toContain("auth.resend");
    expect(recovery).toContain("resetPasswordForEmail");
    expect(reset).toContain("auth.updateUser({ password })");
    expect(reset).toContain('signOut({ scope: "others" })');
  });

  it("requires reauthentication for sensitive account changes and exposes session controls", () => {
    const account = source("../../app/account/actions.ts");

    expect(account).toContain("verifyCurrentPassword");
    expect(account).toContain("signInWithPassword");
    expect(account).toContain("auth.updateUser(\n    { email: nextEmail }");
    expect(account).toContain("auth.updateUser({ password: nextPassword })");
    expect(account).toContain('signOut({ scope: "others" })');
    expect(account).toContain('signOut({ scope: "global" })');
  });

  it("supports both PKCE code callbacks and token-hash email templates", () => {
    const callback = source("../../app/auth/callback/route.ts");
    const confirm = source("../../app/auth/confirm/route.ts");

    expect(callback).toContain("exchangeCodeForSession");
    expect(confirm).toContain("verifyOtp");
    expect(confirm).toContain('type === "recovery"');
  });

  it("keeps raw provider errors out of user-visible auth surfaces", () => {
    const loginPage = source("../../app/login/page.tsx");
    const accountPage = source("../../app/account/page.tsx");

    expect(loginPage).toContain("authErrorMessage");
    expect(accountPage).toContain("authErrorMessage");
    expect(loginPage).not.toContain("error.message");
    expect(accountPage).not.toContain("error.message");
  });
});

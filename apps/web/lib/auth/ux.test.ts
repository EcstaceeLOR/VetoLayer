import { describe, expect, it } from "vitest";
import { authErrorMessage, authSuccessMessage, isValidEmail, MIN_PASSWORD_LENGTH, sanitizeDisplayName, validateNewPassword } from "./ux";

describe("auth UX contracts", () => {
  it("validates account emails without accepting malformed addresses", () => {
    expect(isValidEmail("ada@example.com")).toBe(true);
    expect(isValidEmail("ada example.com")).toBe(false);
    expect(isValidEmail("ada@example")).toBe(false);
  });

  it("enforces one password rule across signup and reset", () => {
    expect(validateNewPassword("x".repeat(MIN_PASSWORD_LENGTH - 1))).toBe("signup_requirements");
    expect(validateNewPassword("x".repeat(MIN_PASSWORD_LENGTH), "different-value")).toBe("password_mismatch");
    expect(validateNewPassword("x".repeat(MIN_PASSWORD_LENGTH), "x".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("normalizes display names without allowing unbounded metadata", () => {
    expect(sanitizeDisplayName("  Ada    Lovelace  ")).toBe("Ada Lovelace");
    expect(sanitizeDisplayName("x".repeat(200))).toHaveLength(80);
  });

  it("maps stable auth codes to product-safe messages", () => {
    expect(authErrorMessage("sign_in_failed")).toMatch(/could not sign you in/i);
    expect(authErrorMessage("unknown-provider-message")).toMatch(/could not be completed/i);
    expect(authSuccessMessage("recovery_sent")).toMatch(/reset link/i);
  });
});

import { describe, expect, it } from "vitest";
import { resolveAppOrigin } from "./app-origin";

function env(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

describe("resolveAppOrigin", () => {
  it("prefers the configured canonical app URL over the request Origin", () => {
    expect(
      resolveAppOrigin(
        "https://attacker.example",
        env({ NEXT_PUBLIC_APP_URL: "https://vetolayer.example/path" }),
      ),
    ).toBe("https://vetolayer.example");
  });

  it("uses Vercel production metadata when no explicit app URL is configured", () => {
    expect(
      resolveAppOrigin(undefined, env({ VERCEL_PROJECT_PRODUCTION_URL: "vetolayer.vercel.app" })),
    ).toBe("https://vetolayer.vercel.app");
  });

  it("falls back to a valid request origin for local development", () => {
    expect(resolveAppOrigin("http://localhost:3000", env())).toBe("http://localhost:3000");
  });

  it("rejects non-http origins", () => {
    expect(resolveAppOrigin("javascript:alert(1)", env())).toBeUndefined();
  });
});

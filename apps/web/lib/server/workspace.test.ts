import { describe, expect, it } from "vitest";
import { workspaceIdForUser, workspaceLabelFromEmail } from "./workspace";

describe("workspace ownership", () => {
  it("derives stable isolated workspace ids from authenticated user ids", () => {
    expect(workspaceIdForUser("user-a")).toBe("user:user-a");
    expect(workspaceIdForUser("user-b")).toBe("user:user-b");
    expect(workspaceIdForUser("user-a")).not.toBe(workspaceIdForUser("user-b"));
  });

  it("rejects empty user ids", () => {
    expect(() => workspaceIdForUser("   ")).toThrow(/userId is required/);
  });

  it("builds a human-readable personal workspace label without exposing the full email", () => {
    expect(workspaceLabelFromEmail("ada.lovelace@example.com")).toBe("Ada Lovelace Workspace");
  });
});

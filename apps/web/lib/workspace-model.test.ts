import { describe, expect, it } from "vitest";
import { canAssignWorkspaceRole, hasWorkspacePermission, normalizeEntityName, slugifyWorkspaceName } from "./workspace-model";

describe("workspace role permissions", () => {
  it("lets reviewers resolve reviews without granting administration", () => {
    expect(hasWorkspacePermission("reviewer", "reviews.read")).toBe(true);
    expect(hasWorkspacePermission("reviewer", "reviews.resolve")).toBe(true);
    expect(hasWorkspacePermission("reviewer", "policies.write")).toBe(false);
    expect(hasWorkspacePermission("reviewer", "integrations.write")).toBe(false);
    expect(hasWorkspacePermission("reviewer", "members.manage")).toBe(false);
    expect(hasWorkspacePermission("reviewer", "audit.read")).toBe(false);
    expect(hasWorkspacePermission("reviewer", "audit.export")).toBe(false);
  });

  it("keeps owner-only and admin-safe boundaries explicit", () => {
    expect(hasWorkspacePermission("owner", "workspace.archive")).toBe(true);
    expect(hasWorkspacePermission("admin", "workspace.archive")).toBe(false);
    expect(hasWorkspacePermission("owner", "audit.read")).toBe(true);
    expect(hasWorkspacePermission("owner", "audit.export")).toBe(true);
    expect(hasWorkspacePermission("admin", "audit.read")).toBe(true);
    expect(hasWorkspacePermission("admin", "audit.export")).toBe(true);
    expect(hasWorkspacePermission("member", "audit.read")).toBe(false);
    expect(canAssignWorkspaceRole("owner", "admin")).toBe(true);
    expect(canAssignWorkspaceRole("admin", "reviewer")).toBe(true);
    expect(canAssignWorkspaceRole("admin", "admin")).toBe(false);
    expect(canAssignWorkspaceRole("reviewer", "member")).toBe(false);
  });

  it("normalizes organization names and stable URL slugs", () => {
    expect(normalizeEntityName("  Platform   Engineering  ")).toBe("Platform Engineering");
    expect(slugifyWorkspaceName("Agent Risk & Controls")).toBe("agent-risk-controls");
  });
});

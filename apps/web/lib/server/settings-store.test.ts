import { describe, expect, it } from "vitest";
import {
  createMemoryWorkspaceSettingsStore,
  defaultWorkspaceRetentionSettings,
  isRetentionTightening,
  SettingsConflictError,
} from "./settings-store";

describe("workspace settings store", () => {
  it("uses explicit production-safe retention defaults", () => {
    const settings = defaultWorkspaceRetentionSettings("ws_test", "2026-09-25T00:00:00.000Z");
    expect(settings.revision).toBe(0);
    expect(settings.decisionRetentionDays).toBe(365);
    expect(settings.reviewRetentionDays).toBe(365);
    expect(settings.notificationRetentionDays).toBe(90);
  });

  it("uses compare-and-swap revisions so stale forms cannot silently overwrite settings", async () => {
    const store = createMemoryWorkspaceSettingsStore();
    const first = await store.save("ws_test", {
      expectedRevision: 0,
      decisionRetentionDays: 365,
      reviewRetentionDays: 365,
      notificationRetentionDays: 90,
      updatedByUserId: "user_1",
    });
    expect(first.revision).toBe(1);

    await expect(store.save("ws_test", {
      expectedRevision: 0,
      decisionRetentionDays: 180,
      reviewRetentionDays: 180,
      notificationRetentionDays: 30,
      updatedByUserId: "user_2",
    })).rejects.toBeInstanceOf(SettingsConflictError);
  });

  it("requires destructive confirmation only when a retention window becomes shorter", () => {
    const current = defaultWorkspaceRetentionSettings("ws_test");
    expect(isRetentionTightening(current, {
      decisionRetentionDays: 180,
      reviewRetentionDays: 365,
      notificationRetentionDays: 90,
    })).toBe(true);
    expect(isRetentionTightening(current, {
      decisionRetentionDays: 730,
      reviewRetentionDays: 0,
      notificationRetentionDays: 180,
    })).toBe(false);
    expect(isRetentionTightening({ ...current, decisionRetentionDays: 0 }, {
      decisionRetentionDays: 365,
      reviewRetentionDays: 365,
      notificationRetentionDays: 90,
    })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { productNavigation } from "../product-navigation";
import {
  DATA_LIFECYCLE_DELETE_DELAY_MS,
  DATA_LIFECYCLE_EXCLUSIONS,
  createMemoryDataLifecycleStore,
  deletionSchedule,
  isActiveDeletionJob,
  type DataLifecycleJob,
} from "./data-lifecycle";

describe("data lifecycle", () => {
  it("keeps the workspace removal recovery window at 24 hours", () => {
    const start = Date.parse("2026-09-25T12:00:00.000Z");
    expect(Date.parse(deletionSchedule(start)) - start).toBe(DATA_LIFECYCLE_DELETE_DELAY_MS);
    expect(DATA_LIFECYCLE_DELETE_DELAY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("only exposes due jobs to the worker and stops completed jobs from being reclaimed", async () => {
    const store = createMemoryDataLifecycleStore();
    const exportJob = await store.create({ workspaceId: "ws_data_test", requestedByUserId: "user_data_test", kind: "workspace_export" });
    await store.create({
      workspaceId: "ws_data_test",
      requestedByUserId: "user_data_test",
      kind: "workspace_delete",
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
    });

    expect((await store.listDue()).map((job) => job.id)).toContain(exportJob.id);
    await store.update(exportJob.id, { status: "completed", completedAt: new Date().toISOString() });
    expect((await store.listDue()).map((job) => job.id)).not.toContain(exportJob.id);
  });

  it("recognizes only live destructive jobs as active", () => {
    const base: DataLifecycleJob = {
      id: "job_1",
      workspaceId: "ws_1",
      requestedByUserId: "user_1",
      kind: "workspace_delete",
      status: "scheduled",
      scheduledFor: "2026-09-26T12:00:00.000Z",
      attempts: 0,
      payload: {},
      createdAt: "2026-09-25T12:00:00.000Z",
      updatedAt: "2026-09-25T12:00:00.000Z",
    };
    expect(isActiveDeletionJob(base)).toBe(true);
    expect(isActiveDeletionJob({ ...base, status: "completed" })).toBe(false);
    expect(isActiveDeletionJob({ ...base, kind: "workspace_export", status: "queued" })).toBe(false);
  });

  it("documents credential classes that must never enter workspace exports", () => {
    const exclusions = DATA_LIFECYCLE_EXCLUSIONS.join(" ").toLowerCase();
    expect(exclusions).toContain("api key");
    expect(exclusions).toContain("webhook");
    expect(exclusions).toContain("github");
    expect(exclusions).toContain("password");
    expect(exclusions).toContain("service-role");
  });

  it("exposes the data lifecycle center in product navigation", () => {
    const items = productNavigation.flatMap((section) => section.items);
    expect(items.some((item) => item.href === "/dashboard/data" && item.label === "Data")).toBe(true);
  });
});

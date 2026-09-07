import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({ initializeDatabase: db.initializeDatabase }));

describe("shortcutRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
  });

  it("lists resolved note and notebook labels in manual order", async () => {
    db.select.mockResolvedValueOnce([
      {
        id: "shortcut-1",
        target_type: "note",
        target_id: "note-1",
        label: "First note",
        sort_order: 0,
        created_at: "created",
      },
    ]);
    const { listShortcuts } = await import("./shortcutRepository");
    await expect(listShortcuts()).resolves.toEqual([
      {
        id: "shortcut-1",
        targetType: "note",
        targetId: "note-1",
        label: "First note",
        sortOrder: 0,
        createdAt: "created",
      },
    ]);
  });

  it("adds idempotently and removes by target with bound values", async () => {
    const { addShortcut, removeShortcut } = await import(
      "./shortcutRepository"
    );

    await addShortcut("notebook", "nb-1");
    await removeShortcut("notebook", "nb-1");

    expect(db.execute.mock.calls[0][0]).toContain("INSERT OR IGNORE");
    expect(db.execute.mock.calls[0][1].slice(1, 3)).toEqual([
      "notebook",
      "nb-1",
    ]);
    expect(db.execute.mock.calls[1][1]).toEqual(["notebook", "nb-1"]);
  });
});

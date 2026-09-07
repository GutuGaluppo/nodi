import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({ initializeDatabase: db.initializeDatabase }));

describe("notebookStackRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
  });

  it("lists mapped stacks in alphabetical order", async () => {
    db.select.mockResolvedValueOnce([
      {
        id: "stack-1",
        name: "Work",
        created_at: "2026-09-07T12:00:00.000Z",
        updated_at: "2026-09-07T12:00:00.000Z",
      },
    ]);
    const { listNotebookStacks } = await import("./notebookStackRepository");

    await expect(listNotebookStacks()).resolves.toEqual([
      {
        id: "stack-1",
        name: "Work",
        createdAt: "2026-09-07T12:00:00.000Z",
        updatedAt: "2026-09-07T12:00:00.000Z",
      },
    ]);
    expect(db.select.mock.calls[0][0]).toContain(
      "ORDER BY name COLLATE NOCASE",
    );
  });

  it("creates, renames, and deletes with parameterized statements", async () => {
    const { createNotebookStack, deleteNotebookStack, renameNotebookStack } =
      await import("./notebookStackRepository");

    const created = await createNotebookStack("  Work ");
    await renameNotebookStack(created.id, "Studio");
    await deleteNotebookStack(created.id);

    expect(created.name).toBe("Work");
    expect(db.execute.mock.calls[0][1][1]).toBe("Work");
    expect(db.execute.mock.calls[1][1][0]).toBe("Studio");
    expect(db.execute.mock.calls[2]).toEqual([
      "DELETE FROM notebook_stacks WHERE id = $1",
      [created.id],
    ]);
  });
});

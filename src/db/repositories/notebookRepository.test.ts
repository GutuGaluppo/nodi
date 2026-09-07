import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({ initializeDatabase: db.initializeDatabase }));

describe("notebookRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
  });

  it("lists active notebooks alphabetically and maps stored fields", async () => {
    db.select.mockResolvedValueOnce([
      {
        id: "nb-1",
        name: "Projects",
        stack_id: null,
        created_at: "2026-09-07T12:00:00.000Z",
        updated_at: "2026-09-07T12:00:00.000Z",
        deleted_at: null,
      },
    ]);
    const { listNotebooks } = await import("./notebookRepository");

    await expect(listNotebooks()).resolves.toEqual([
      {
        id: "nb-1",
        name: "Projects",
        stackId: null,
        createdAt: "2026-09-07T12:00:00.000Z",
        updatedAt: "2026-09-07T12:00:00.000Z",
        deletedAt: null,
      },
    ]);
    expect(db.select.mock.calls[0][0]).toContain(
      "ORDER BY name COLLATE NOCASE",
    );
  });

  it("creates a trimmed notebook with parameterized SQL", async () => {
    const { createNotebook } = await import("./notebookRepository");
    const notebook = await createNotebook("  Projects  ");

    expect(db.execute.mock.calls[0][0]).toContain("VALUES ($1, $2");
    expect(db.execute.mock.calls[0][1][1]).toBe("Projects");
    expect(notebook.name).toBe("Projects");
  });

  it("renames and deletes by id with bound parameters", async () => {
    const { deleteNotebook, renameNotebook } = await import(
      "./notebookRepository"
    );

    await renameNotebook("nb-1", "Archive");
    await deleteNotebook("nb-1");

    expect(db.execute.mock.calls[0][1][0]).toBe("Archive");
    expect(db.execute.mock.calls[0][1][2]).toBe("nb-1");
    expect(db.execute.mock.calls[1]).toEqual([
      "DELETE FROM notebooks WHERE id = $1",
      ["nb-1"],
    ]);
  });

  it("rejects blank names before writing", async () => {
    const { createNotebook } = await import("./notebookRepository");
    await expect(createNotebook("   ")).rejects.toThrow(
      "A notebook name is required",
    );
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("moves a notebook into or out of a stack", async () => {
    const { moveNotebookToStack } = await import("./notebookRepository");

    await moveNotebookToStack("nb-1", "stack-1");
    await moveNotebookToStack("nb-1", null);

    expect(db.execute.mock.calls[0][0]).toContain("SET stack_id = $1");
    expect(db.execute.mock.calls[0][1][0]).toBe("stack-1");
    expect(db.execute.mock.calls[1][1][0]).toBeNull();
  });
});

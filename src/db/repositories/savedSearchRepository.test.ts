import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({ initializeDatabase: db.initializeDatabase }));

describe("savedSearchRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
  });

  it("lists saved searches as domain objects", async () => {
    db.select.mockResolvedValueOnce([
      {
        id: "search-1",
        name: "Project ideas",
        query: 'notebook:"Projects" idea',
        created_at: "created",
        updated_at: "updated",
      },
    ]);
    const { listSavedSearches } = await import("./savedSearchRepository");

    await expect(listSavedSearches()).resolves.toEqual([
      {
        id: "search-1",
        name: "Project ideas",
        query: 'notebook:"Projects" idea',
        createdAt: "created",
        updatedAt: "updated",
      },
    ]);
  });

  it("normalizes and inserts a named query with bound values", async () => {
    const { createSavedSearch } = await import("./savedSearchRepository");

    const saved = await createSavedSearch("  Project ideas  ", "  tag:idea  ");

    expect(saved.name).toBe("Project ideas");
    expect(saved.query).toBe("tag:idea");
    expect(db.execute.mock.calls[0][0]).toContain(
      "VALUES ($1, $2, $3, $4, $4)",
    );
    expect(db.execute.mock.calls[0][1].slice(1, 3)).toEqual([
      "Project ideas",
      "tag:idea",
    ]);
  });

  it("rejects empty names and deletes by id with a bound value", async () => {
    const { createSavedSearch, deleteSavedSearch } = await import(
      "./savedSearchRepository"
    );

    await expect(createSavedSearch(" ", "tag:idea")).rejects.toMatchObject({
      name: "DatabaseError",
      message: "A saved search name is required.",
    });
    await deleteSavedSearch("search-1");
    expect(db.execute).toHaveBeenLastCalledWith(
      "DELETE FROM saved_searches WHERE id = $1",
      ["search-1"],
    );
  });
});

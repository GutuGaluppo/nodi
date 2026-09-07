import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({ initializeDatabase: db.initializeDatabase }));

describe("tagRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
  });

  it("lists tags alphabetically and maps timestamps", async () => {
    db.select.mockResolvedValueOnce([
      {
        id: "tag-1",
        name: "ideas",
        created_at: "2026-09-07T12:00:00.000Z",
        updated_at: "2026-09-07T12:00:00.000Z",
      },
    ]);
    const { listTags } = await import("./tagRepository");
    await expect(listTags()).resolves.toEqual([
      {
        id: "tag-1",
        name: "ideas",
        createdAt: "2026-09-07T12:00:00.000Z",
        updatedAt: "2026-09-07T12:00:00.000Z",
      },
    ]);
  });

  it("creates, renames, and deletes tags with bound values", async () => {
    const { createTag, deleteTag, renameTag } = await import("./tagRepository");
    const created = await createTag(" ideas ");
    await renameTag(created.id, "research");
    await deleteTag(created.id);

    expect(created.name).toBe("ideas");
    expect(db.execute.mock.calls[0][1][1]).toBe("ideas");
    expect(db.execute.mock.calls[1][1][0]).toBe("research");
    expect(db.execute.mock.calls[2]).toEqual([
      "DELETE FROM tags WHERE id = $1",
      [created.id],
    ]);
  });
});

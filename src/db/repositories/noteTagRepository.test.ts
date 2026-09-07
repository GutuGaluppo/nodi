import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({ initializeDatabase: db.initializeDatabase }));

describe("noteTagRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
  });

  it("lists a note's tags using a bound note id", async () => {
    db.select.mockResolvedValueOnce([
      {
        id: "tag-1",
        name: "ideas",
        created_at: "created",
        updated_at: "updated",
      },
    ]);
    const { listTagsForNote } = await import("./noteTagRepository");

    await expect(listTagsForNote("note-1")).resolves.toEqual([
      {
        id: "tag-1",
        name: "ideas",
        createdAt: "created",
        updatedAt: "updated",
      },
    ]);
    expect(db.select.mock.calls[0][1]).toEqual(["note-1"]);
  });

  it("adds idempotently and removes with parameterized relationships", async () => {
    const { addTagToNote, removeTagFromNote } = await import(
      "./noteTagRepository"
    );

    await addTagToNote("note-1", "tag-1");
    await removeTagFromNote("note-1", "tag-1");

    expect(db.execute.mock.calls[0]).toEqual([
      expect.stringContaining("INSERT OR IGNORE"),
      ["note-1", "tag-1"],
    ]);
    expect(db.execute.mock.calls[1]).toEqual([
      "DELETE FROM note_tags WHERE note_id = $1 AND tag_id = $2",
      ["note-1", "tag-1"],
    ]);
  });
});

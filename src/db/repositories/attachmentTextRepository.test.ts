import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({
  initializeDatabase: db.initializeDatabase,
}));

describe("attachmentTextRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
  });

  it("lists only images in active, non-private notes without text", async () => {
    db.select.mockResolvedValueOnce([
      { id: "a1", relative_path: "attachments/ab/a/image.png" },
    ]);
    const { listPendingImages } = await import("./attachmentTextRepository");

    await expect(listPendingImages()).resolves.toEqual([
      { attachmentId: "a1", relativePath: "attachments/ab/a/image.png" },
    ]);
    const [sql] = db.select.mock.calls[0];
    expect(sql).toContain("attachments.mime_type LIKE 'image/%'");
    expect(sql).toContain("notes.is_private = 0");
    expect(sql).toContain("notes.deleted_at IS NULL");
    expect(sql).toContain("NOT EXISTS");
  });

  it("saves text only while the note is not private", async () => {
    const { saveAttachmentText } = await import("./attachmentTextRepository");

    await saveAttachmentText("a1", "  Lisbon bakery  ");

    const [sql, values] = db.execute.mock.calls[0];
    expect(sql).toContain("notes.is_private = 0");
    expect(values.slice(0, 2)).toEqual(["a1", "Lisbon bakery"]);
  });

  it("reports recognized and waiting images", async () => {
    db.select.mockResolvedValueOnce([{ recognized: 3, waiting: 1 }]);
    const { getImageTextStatus } = await import("./attachmentTextRepository");

    await expect(getImageTextStatus()).resolves.toEqual({
      recognized: 3,
      waiting: 1,
    });
  });
});

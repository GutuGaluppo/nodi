import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({
  initializeDatabase: db.initializeDatabase,
}));

describe("listExportableNotes", () => {
  beforeEach(() => {
    vi.resetModules();
    db.select.mockReset();
    db.initializeDatabase.mockReset().mockResolvedValue({ select: db.select });
  });

  it("never selects private or trashed notes", async () => {
    db.select.mockResolvedValueOnce([]);
    const { listExportableNotes } = await import("./exportRepository");

    await listExportableNotes();

    const [sql] = db.select.mock.calls[0];
    expect(sql).toContain("notes.deleted_at IS NULL AND notes.is_private = 0");
  });

  it("maps rows and splits tags", async () => {
    db.select.mockResolvedValueOnce([
      {
        id: "n-1",
        title: "Launch plan",
        content_json: "{}",
        content_text: "Plan",
        notebook: "Product",
        tags: "urgent\u001froadmap",
        created_at: "c",
        updated_at: "u",
      },
      {
        id: "n-2",
        title: "Loose",
        content_json: "{}",
        notebook: null,
        tags: null,
        created_at: "c",
        updated_at: "u",
      },
    ]);
    const { listExportableNotes } = await import("./exportRepository");

    const notes = await listExportableNotes();

    expect(notes[0]).toEqual({
      id: "n-1",
      title: "Launch plan",
      contentJson: "{}",
      contentText: "Plan",
      notebook: "Product",
      tags: ["roadmap", "urgent"],
      createdAt: "c",
      updatedAt: "u",
    });
    expect(notes[1].tags).toEqual([]);
  });
});

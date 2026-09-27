import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({
  initializeDatabase: db.initializeDatabase,
}));

describe("embeddingRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
  });

  it("finds new or edited notes, never private or trashed ones", async () => {
    db.select.mockResolvedValueOnce([
      { id: "n1", title: "Launch", content_text: "Plan", updated_at: "u" },
    ]);
    const { listStaleNotes } = await import("./embeddingRepository");

    await expect(listStaleNotes(10)).resolves.toEqual([
      { id: "n1", text: "Launch\nPlan", updatedAt: "u" },
    ]);
    const [sql, values] = db.select.mock.calls[0];
    expect(sql).toContain("notes.deleted_at IS NULL AND notes.is_private = 0");
    expect(sql).toContain("source_updated_at <> notes.updated_at");
    expect(values).toEqual([10]);
  });

  it("does not store a vector for a note that became private", async () => {
    const { saveEmbeddings } = await import("./embeddingRepository");

    await saveEmbeddings([
      { noteId: "n1", language: "en", vector: "AAAA", sourceUpdatedAt: "u" },
    ]);

    expect(db.execute.mock.calls[0][0]).toContain("notes.is_private = 0");
  });

  it("loads vectors only for eligible notes", async () => {
    const { listEmbeddings } = await import("./embeddingRepository");

    await listEmbeddings();

    expect(db.select.mock.calls[0][0]).toContain(
      "notes.deleted_at IS NULL AND notes.is_private = 0",
    );
  });
});

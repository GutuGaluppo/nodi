import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
  ensureDeviceId: vi.fn(),
}));

vi.mock("../database", () => ({
  initializeDatabase: db.initializeDatabase,
}));

vi.mock("../deviceId", () => ({
  ensureDeviceId: db.ensureDeviceId,
}));

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function noteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    title: "First note",
    content_json: '{"type":"doc","content":[{"type":"paragraph"}]}',
    content_text: "First note body",
    notebook_id: null,
    is_pinned: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    deleted_at: null,
    revision: 3,
    device_id: "device-1",
    ...overrides,
  };
}

async function importRepository() {
  return import("./noteRepository");
}

describe("noteRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
    db.ensureDeviceId.mockReset().mockResolvedValue("device-1");
  });

  describe("createNote", () => {
    it("inserts a parameterized row with generated id, matching timestamps, revision 1, and the device id", async () => {
      db.select.mockResolvedValueOnce([noteRow()]);
      const { createNote, EMPTY_NOTE_CONTENT_JSON } = await importRepository();

      const before = new Date().toISOString();
      await createNote();
      const after = new Date().toISOString();

      const [sql, params] = db.execute.mock.calls[0];
      expect(sql).toContain("INSERT INTO notes");
      // created_at and updated_at bind the same parameter; revision is a literal 1.
      expect(sql).toContain("$7, $7, NULL, 1, $8");

      const [
        id,
        title,
        contentJson,
        contentText,
        notebookId,
        isPinned,
        ts,
        deviceId,
      ] = params;
      expect(id).toMatch(UUID_V7);
      expect(title).toBe("");
      expect(contentJson).toBe(EMPTY_NOTE_CONTENT_JSON);
      expect(contentText).toBe("");
      expect(notebookId).toBeNull();
      expect(isPinned).toBe(0);
      expect(deviceId).toBe("device-1");
      expect(ts >= before && ts <= after).toBe(true);
    });

    it("applies caller-provided fields and reads the note back", async () => {
      db.select.mockResolvedValueOnce([
        noteRow({ title: "Groceries", is_pinned: 1, notebook_id: "nb-1" }),
      ]);
      const { createNote } = await importRepository();

      const note = await createNote({
        title: "Groceries",
        contentText: "milk",
        notebookId: "nb-1",
        isPinned: true,
      });

      const params = db.execute.mock.calls[0][1];
      expect(params[1]).toBe("Groceries");
      expect(params[3]).toBe("milk");
      expect(params[4]).toBe("nb-1");
      expect(params[5]).toBe(1);
      expect(note).toEqual({
        id: "note-1",
        title: "Groceries",
        contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
        contentText: "First note body",
        notebookId: "nb-1",
        isPinned: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        deletedAt: null,
        revision: 3,
        deviceId: "device-1",
      });
    });
  });

  describe("getNoteById", () => {
    it("maps a stored row into a camelCase note", async () => {
      db.select.mockResolvedValueOnce([
        noteRow({ is_pinned: 1, deleted_at: "2026-02-01T00:00:00.000Z" }),
      ]);
      const { getNoteById } = await importRepository();

      const note = await getNoteById("note-1");

      expect(db.select).toHaveBeenCalledWith(
        expect.stringContaining("WHERE id = $1"),
        ["note-1"],
      );
      expect(note?.isPinned).toBe(true);
      expect(note?.deletedAt).toBe("2026-02-01T00:00:00.000Z");
    });

    it("returns null when no row matches", async () => {
      const { getNoteById } = await importRepository();
      await expect(getNoteById("missing")).resolves.toBeNull();
    });
  });

  describe("listNotes", () => {
    it("excludes trashed notes and orders by recency by default", async () => {
      const { listNotes } = await importRepository();
      await listNotes();

      const [sql, values] = db.select.mock.calls[0];
      expect(sql).toContain("WHERE deleted_at IS NULL");
      expect(sql).toContain("ORDER BY updated_at DESC, created_at DESC");
      expect(sql).not.toContain("content_json");
      expect(values).toEqual([]);
    });

    it("lists only trashed notes for the Trash view", async () => {
      const { listNotes } = await importRepository();
      await listNotes({ deleted: "only" });

      expect(db.select.mock.calls[0][0]).toContain(
        "WHERE deleted_at IS NOT NULL",
      );
    });

    it("omits the deleted filter when asked to include everything", async () => {
      const { listNotes } = await importRepository();
      await listNotes({ deleted: "include" });

      const [sql, values] = db.select.mock.calls[0];
      expect(sql).not.toContain("WHERE");
      expect(sql).not.toContain("deleted_at IS");
      expect(values).toEqual([]);
    });

    it("filters by notebook, including the no-notebook case", async () => {
      const { listNotes } = await importRepository();

      await listNotes({ notebookId: "nb-1" });
      expect(db.select.mock.calls[0][0]).toContain("notebook_id = $1");
      expect(db.select.mock.calls[0][1]).toEqual(["nb-1"]);

      db.select.mockClear();
      await listNotes({ notebookId: null });
      expect(db.select.mock.calls[0][0]).toContain("notebook_id IS NULL");
      expect(db.select.mock.calls[0][1]).toEqual([]);
    });

    it("filters by tag through a bound relationship lookup", async () => {
      const { listNotes } = await importRepository();

      await listNotes({ tagId: "tag-1" });

      const [sql, values] = db.select.mock.calls[0];
      expect(sql).toContain("EXISTS (SELECT 1 FROM note_tags");
      expect(sql).toContain("note_tags.tag_id = $1");
      expect(values).toEqual(["tag-1"]);
    });

    it("passes limit and offset as bound parameters", async () => {
      const { listNotes } = await importRepository();
      await listNotes({ limit: 10, offset: 20 });

      const [sql, values] = db.select.mock.calls[0];
      expect(sql).toContain("LIMIT $1 OFFSET $2");
      expect(values).toEqual([10, 20]);
    });

    it("maps rows to summaries without a note body", async () => {
      db.select.mockResolvedValueOnce([
        {
          id: "note-1",
          title: "First",
          content_text: "preview",
          notebook_id: "nb-1",
          is_pinned: 1,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
          deleted_at: null,
        },
      ]);
      const { listNotes } = await importRepository();

      const [summary] = await listNotes();
      expect(summary).toEqual({
        id: "note-1",
        title: "First",
        contentText: "preview",
        notebookId: "nb-1",
        isPinned: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        deletedAt: null,
      });
      expect(summary).not.toHaveProperty("contentJson");
    });
  });

  describe("updateNote", () => {
    it("updates only the provided columns, bumps revision, and refreshes updated_at", async () => {
      db.select.mockResolvedValueOnce([
        noteRow({ title: "Renamed", revision: 4 }),
      ]);
      const { updateNote } = await importRepository();

      const before = new Date().toISOString();
      const note = await updateNote("note-1", { title: "Renamed" });
      const after = new Date().toISOString();

      const [sql, values] = db.execute.mock.calls[0];
      expect(sql).toBe(
        "UPDATE notes SET title = $1, updated_at = $2, revision = revision + 1 WHERE id = $3",
      );
      expect(values[0]).toBe("Renamed");
      expect(values[1] >= before && values[1] <= after).toBe(true);
      expect(values[2]).toBe("note-1");
      expect(note.revision).toBe(4);
    });

    it("serializes isPinned to an integer", async () => {
      db.select.mockResolvedValueOnce([noteRow({ is_pinned: 1 })]);
      const { updateNote } = await importRepository();

      await updateNote("note-1", { isPinned: true });

      const [sql, values] = db.execute.mock.calls[0];
      expect(sql).toContain("is_pinned = $1");
      expect(values[0]).toBe(1);
    });

    it("still touches updated_at and revision for an empty patch", async () => {
      db.select.mockResolvedValueOnce([noteRow()]);
      const { updateNote } = await importRepository();

      await updateNote("note-1");

      expect(db.execute.mock.calls[0][0]).toBe(
        "UPDATE notes SET updated_at = $1, revision = revision + 1 WHERE id = $2",
      );
    });

    it("rejects when the note does not exist", async () => {
      db.execute.mockResolvedValueOnce({ rowsAffected: 0 });
      const { updateNote } = await importRepository();
      const { DatabaseError } = await import("../../lib/errors/DatabaseError");

      await expect(
        updateNote("missing", { title: "x" }),
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe("searchNotes", () => {
    it("uses the FTS index with bound query and limit, ordered by bm25", async () => {
      db.select.mockResolvedValueOnce([]);
      const { searchNotes } = await importRepository();

      await searchNotes("project", 20);

      const [sql, values] = db.select.mock.calls[0];
      expect(sql).toContain("notes_fts MATCH $1");
      expect(sql).toContain("ORDER BY bm25(notes_fts");
      expect(sql).toContain("notes.deleted_at IS NULL");
      expect(values).toEqual(['"project"*', 20]);
    });

    it("does not query the database for blank input", async () => {
      const { searchNotes } = await importRepository();
      await expect(searchNotes("   ")).resolves.toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe("trash lifecycle", () => {
    it("soft deletes without removing the row", async () => {
      const { softDeleteNote } = await importRepository();
      await softDeleteNote("note-1");

      const [sql, values] = db.execute.mock.calls[0];
      expect(sql).toBe(
        "UPDATE notes SET deleted_at = $1, updated_at = $2, revision = revision + 1 WHERE id = $3 AND deleted_at IS NULL",
      );
      expect(values[0]).toBe(values[1]);
      expect(values[2]).toBe("note-1");
    });

    it("restores only a trashed note", async () => {
      const { restoreNote } = await importRepository();
      await restoreNote("note-1");

      expect(db.execute.mock.calls[0][0]).toBe(
        "UPDATE notes SET deleted_at = NULL, updated_at = $1, revision = revision + 1 WHERE id = $2 AND deleted_at IS NOT NULL",
      );
      expect(db.execute.mock.calls[0][1][1]).toBe("note-1");
    });

    it("permanently deletes with a parameterized statement", async () => {
      const { permanentlyDeleteNote } = await importRepository();
      await permanentlyDeleteNote("note-1");

      expect(db.execute).toHaveBeenCalledWith(
        "DELETE FROM notes WHERE id = $1",
        ["note-1"],
      );
    });
  });

  it("wraps an underlying database failure as a DatabaseError", async () => {
    db.execute.mockRejectedValueOnce(new Error("disk full"));
    const { createNote } = await importRepository();
    const { DatabaseError } = await import("../../lib/errors/DatabaseError");

    await expect(createNote()).rejects.toBeInstanceOf(DatabaseError);
  });
});

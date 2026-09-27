import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({
  initializeDatabase: db.initializeDatabase,
}));

const input = {
  noteId: "note-1",
  filename: "recording.wav",
  mimeType: "audio/wav",
  relativePath: "attachments/ab/abcdef/recording.wav",
  sha256: "abcdef",
  size: 32_000,
};

describe("attachmentRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
  });

  it("persists attachment metadata, never the file", async () => {
    const { createAttachment } = await import("./attachmentRepository");

    const attachment = await createAttachment(input);

    const [sql, values] = db.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO attachments");
    expect(values.slice(1, 7)).toEqual([
      "note-1",
      "recording.wav",
      "audio/wav",
      "attachments/ab/abcdef/recording.wav",
      "abcdef",
      32_000,
    ]);
    expect(attachment.noteId).toBe("note-1");
  });

  it.each([
    "../secrets.txt",
    "attachments/../../etc/passwd",
    "/Users/me/file.wav",
    "attachments//x.wav",
  ])("refuses the unsafe path %s", async (relativePath) => {
    const { createAttachment } = await import("./attachmentRepository");
    const { DatabaseError } = await import("../../lib/errors/DatabaseError");

    await expect(
      createAttachment({ ...input, relativePath }),
    ).rejects.toBeInstanceOf(DatabaseError);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("reads an attachment back as a domain object", async () => {
    db.select.mockResolvedValueOnce([
      {
        id: "a1",
        note_id: "note-1",
        filename: "recording.wav",
        mime_type: "audio/wav",
        relative_path: "attachments/ab/abcdef/recording.wav",
        sha256: "abcdef",
        size: 32_000,
        created_at: "2026-09-27T10:00:00.000Z",
      },
    ]);
    const { getAttachment } = await import("./attachmentRepository");

    await expect(getAttachment("a1")).resolves.toMatchObject({
      id: "a1",
      relativePath: "attachments/ab/abcdef/recording.wav",
    });
  });

  it("lists referenced paths for the sweep", async () => {
    db.select.mockResolvedValueOnce([
      { relative_path: "attachments/ab/abcdef/recording.wav" },
    ]);
    const { listAttachmentPaths } = await import("./attachmentRepository");

    await expect(listAttachmentPaths()).resolves.toEqual([
      "attachments/ab/abcdef/recording.wav",
    ]);
  });
});

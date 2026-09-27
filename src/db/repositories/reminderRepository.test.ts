import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({
  initializeDatabase: db.initializeDatabase,
}));

async function load() {
  return import("./reminderRepository");
}

describe("reminderRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
  });

  it("replaces a note's pending reminder when a new one is set", async () => {
    const { setReminder } = await load();
    const when = new Date("2026-10-01T10:00:00.000Z");

    const reminder = await setReminder("note-1", when);

    expect(db.execute.mock.calls[0]).toEqual([
      "DELETE FROM reminders WHERE note_id = $1 AND delivered_at IS NULL",
      ["note-1"],
    ]);
    const [sql, values] = db.execute.mock.calls[1];
    expect(sql).toContain("INSERT INTO reminders");
    expect(values[1]).toBe("note-1");
    expect(values[2]).toBe("2026-10-01T10:00:00.000Z");
    expect(reminder.deliveredAt).toBeNull();
  });

  it("rejects an invalid date without writing", async () => {
    const { setReminder } = await load();
    const { DatabaseError } = await import("../../lib/errors/DatabaseError");

    await expect(
      setReminder("note-1", new Date("not a date")),
    ).rejects.toBeInstanceOf(DatabaseError);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("reads the pending reminder for a note", async () => {
    db.select.mockResolvedValueOnce([
      {
        id: "r1",
        note_id: "note-1",
        remind_at: "2026-10-01T10:00:00.000Z",
        created_at: "2026-09-27T10:00:00.000Z",
        delivered_at: null,
      },
    ]);
    const { getPendingReminder } = await load();

    await expect(getPendingReminder("note-1")).resolves.toEqual({
      id: "r1",
      noteId: "note-1",
      remindAt: "2026-10-01T10:00:00.000Z",
      createdAt: "2026-09-27T10:00:00.000Z",
      deliveredAt: null,
    });
    expect(db.select.mock.calls[0][0]).toContain("delivered_at IS NULL");
  });

  it("lists due reminders for active notes and hides private titles", async () => {
    db.select.mockResolvedValueOnce([
      {
        id: "r1",
        note_id: "note-1",
        remind_at: "2026-10-01T10:00:00.000Z",
        created_at: "2026-09-27T10:00:00.000Z",
        delivered_at: null,
        note_label: "Private note",
      },
    ]);
    const { listDueReminders } = await load();

    const due = await listDueReminders(new Date("2026-10-01T10:00:30.000Z"));

    const [sql, values] = db.select.mock.calls[0];
    expect(sql).toContain("notes.deleted_at IS NULL");
    expect(sql).toContain("WHEN notes.is_private = 1 THEN 'Private note'");
    expect(values).toEqual(["2026-10-01T10:00:30.000Z"]);
    expect(due[0].noteLabel).toBe("Private note");
  });

  it("marks a reminder delivered only once", async () => {
    const { markReminderDelivered } = await load();

    await markReminderDelivered("r1", new Date("2026-10-01T10:01:00.000Z"));

    expect(db.execute).toHaveBeenCalledWith(
      "UPDATE reminders SET delivered_at = $1 WHERE id = $2 AND delivered_at IS NULL",
      ["2026-10-01T10:01:00.000Z", "r1"],
    );
  });

  it("clears only the pending reminder", async () => {
    const { clearReminder } = await load();

    await clearReminder("note-1");

    expect(db.execute).toHaveBeenCalledWith(
      "DELETE FROM reminders WHERE note_id = $1 AND delivered_at IS NULL",
      ["note-1"],
    );
  });
});

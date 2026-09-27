import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DueReminder,
  listDueReminders,
  markReminderDelivered,
} from "../../db/repositories/reminderRepository";
import { deliverDueReminders } from "./reminderDelivery";

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("../../db/repositories/reminderRepository", () => ({
  listDueReminders: vi.fn(),
  markReminderDelivered: vi.fn(),
}));

function due(id: string, noteLabel: string): DueReminder {
  return {
    id,
    noteId: `note-${id}`,
    remindAt: "2026-10-01T10:00:00.000Z",
    createdAt: "2026-09-27T10:00:00.000Z",
    deliveredAt: null,
    noteLabel,
  };
}

describe("deliverDueReminders", () => {
  const now = new Date("2026-10-01T10:00:30.000Z");

  beforeEach(() => {
    vi.mocked(listDueReminders).mockReset();
    vi.mocked(markReminderDelivered).mockReset().mockResolvedValue();
  });

  it("notifies each due reminder and marks it delivered", async () => {
    vi.mocked(listDueReminders).mockResolvedValue([
      due("r1", "Launch plan"),
      due("r2", "Private note"),
    ]);
    const notify = vi.fn().mockResolvedValue(undefined);

    await expect(deliverDueReminders(now, notify)).resolves.toBe(2);

    expect(listDueReminders).toHaveBeenCalledWith(now);
    expect(notify.mock.calls.map(([r]) => r.noteLabel)).toEqual([
      "Launch plan",
      "Private note",
    ]);
    expect(markReminderDelivered).toHaveBeenCalledWith("r1", now);
    expect(markReminderDelivered).toHaveBeenCalledWith("r2", now);
  });

  it("keeps a reminder pending when its notification fails", async () => {
    vi.mocked(listDueReminders).mockResolvedValue([
      due("r1", "Launch plan"),
      due("r2", "Groceries"),
    ]);
    const notify = vi
      .fn()
      .mockRejectedValueOnce(new Error("not allowed"))
      .mockResolvedValueOnce(undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(deliverDueReminders(now, notify)).resolves.toBe(1);

    expect(markReminderDelivered).toHaveBeenCalledOnce();
    expect(markReminderDelivered).toHaveBeenCalledWith("r2", now);
    consoleError.mockRestore();
  });

  it("does nothing when no reminder is due", async () => {
    vi.mocked(listDueReminders).mockResolvedValue([]);
    const notify = vi.fn();

    await expect(deliverDueReminders(now, notify)).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });
});

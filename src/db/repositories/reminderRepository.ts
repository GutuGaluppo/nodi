import { DatabaseError } from "../../lib/errors/DatabaseError";
import { createId } from "../../lib/ids/id";
import { initializeDatabase } from "../database";

/**
 * Reminders on notes. A note has at most one pending reminder; setting a new
 * one replaces it. Delivered reminders are kept with `deliveredAt` so a
 * reminder never fires twice.
 */
export interface Reminder {
  id: string;
  noteId: string;
  remindAt: string;
  createdAt: string;
  deliveredAt: string | null;
}

/** A reminder that is due, with the text to show in its notification. */
export interface DueReminder extends Reminder {
  /** The note's title, or "Private note" so private titles never leave the app. */
  noteLabel: string;
}

interface ReminderRow {
  id: string;
  note_id: string;
  remind_at: string;
  created_at: string;
  delivered_at: string | null;
}

interface DueReminderRow extends ReminderRow {
  note_label: string;
}

function mapReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    noteId: row.note_id,
    remindAt: row.remind_at,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  };
}

function rethrow(cause: unknown, message: string): never {
  if (cause instanceof DatabaseError) throw cause;
  throw new DatabaseError(message, cause);
}

const COLUMNS = "id, note_id, remind_at, created_at, delivered_at";

export async function getPendingReminder(
  noteId: string,
): Promise<Reminder | null> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<ReminderRow[]>(
      `SELECT ${COLUMNS} FROM reminders WHERE note_id = $1 AND delivered_at IS NULL ORDER BY remind_at LIMIT 1`,
      [noteId],
    );
    return rows[0] ? mapReminder(rows[0]) : null;
  } catch (cause) {
    rethrow(cause, "Could not read the reminder.");
  }
}

/** Sets the note's reminder, replacing any pending one. */
export async function setReminder(
  noteId: string,
  remindAt: Date,
): Promise<Reminder> {
  if (Number.isNaN(remindAt.getTime())) {
    throw new DatabaseError("The reminder time is not a valid date.");
  }
  try {
    const database = await initializeDatabase();
    const reminder: Reminder = {
      id: createId(),
      noteId,
      remindAt: remindAt.toISOString(),
      createdAt: new Date().toISOString(),
      deliveredAt: null,
    };
    await database.execute(
      "DELETE FROM reminders WHERE note_id = $1 AND delivered_at IS NULL",
      [noteId],
    );
    await database.execute(
      `INSERT INTO reminders (${COLUMNS}) VALUES ($1, $2, $3, $4, NULL)`,
      [reminder.id, noteId, reminder.remindAt, reminder.createdAt],
    );
    return reminder;
  } catch (cause) {
    rethrow(cause, "Could not save the reminder.");
  }
}

export async function clearReminder(noteId: string): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute(
      "DELETE FROM reminders WHERE note_id = $1 AND delivered_at IS NULL",
      [noteId],
    );
  } catch (cause) {
    rethrow(cause, "Could not remove the reminder.");
  }
}

/** Pending reminders due at or before `now`, for notes that are not in the Trash. */
export async function listDueReminders(now: Date): Promise<DueReminder[]> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<DueReminderRow[]>(
      `SELECT reminders.id, reminders.note_id, reminders.remind_at, reminders.created_at, reminders.delivered_at,
              CASE
                WHEN notes.is_private = 1 THEN 'Private note'
                ELSE COALESCE(NULLIF(notes.title, ''), 'Untitled')
              END AS note_label
       FROM reminders
       INNER JOIN notes ON notes.id = reminders.note_id
       WHERE reminders.delivered_at IS NULL
         AND reminders.remind_at <= $1
         AND notes.deleted_at IS NULL
       ORDER BY reminders.remind_at`,
      [now.toISOString()],
    );
    return rows.map((row) => ({
      ...mapReminder(row),
      noteLabel: row.note_label,
    }));
  } catch (cause) {
    rethrow(cause, "Could not read due reminders.");
  }
}

export async function markReminderDelivered(
  id: string,
  deliveredAt: Date,
): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute(
      "UPDATE reminders SET delivered_at = $1 WHERE id = $2 AND delivered_at IS NULL",
      [deliveredAt.toISOString(), id],
    );
  } catch (cause) {
    rethrow(cause, "Could not mark the reminder as delivered.");
  }
}

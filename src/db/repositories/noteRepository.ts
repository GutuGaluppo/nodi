import { DatabaseError } from "../../lib/errors/DatabaseError";
import { createId } from "../../lib/ids/id";
import { initializeDatabase } from "../database";
import { ensureDeviceId } from "../deviceId";

/**
 * The only place note rows are read or written.
 *
 * UI components, the editor, and stores must call these functions rather than
 * issuing SQL. Every statement is parameterized. `content_json` (Tiptap JSON) is
 * the canonical note body; `content_text` is a caller-supplied plain-text
 * projection used for previews and, later, full-text search.
 */

/** A valid empty Tiptap document, used when a note is created with no body. */
export const EMPTY_NOTE_CONTENT_JSON = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

export interface Note {
  id: string;
  title: string;
  contentJson: string;
  contentText: string;
  notebookId: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  revision: number;
  deviceId: string;
}

/** The lighter shape returned by list queries; omits the full note body. */
export interface NoteSummary {
  id: string;
  title: string;
  contentText: string;
  notebookId: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateNoteInput {
  title?: string;
  contentJson?: string;
  contentText?: string;
  notebookId?: string | null;
  isPinned?: boolean;
}

export interface UpdateNoteInput {
  title?: string;
  contentJson?: string;
  contentText?: string;
  notebookId?: string | null;
  isPinned?: boolean;
}

export interface ListNotesInput {
  /** "exclude" (default) hides trashed notes, "only" is the Trash view. */
  deleted?: "exclude" | "only" | "include";
  /** Restrict to a notebook; pass `null` for notes with no notebook. */
  notebookId?: string | null;
  /** Restrict to notes assigned to a tag. */
  tagId?: string;
  limit?: number;
  offset?: number;
}

interface NoteRow {
  id: string;
  title: string;
  content_json: string;
  content_text: string;
  notebook_id: string | null;
  is_pinned: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  revision: number;
  device_id: string;
}

type NoteSummaryRow = Omit<NoteRow, "content_json" | "revision" | "device_id">;

const NOTE_COLUMNS =
  "id, title, content_json, content_text, notebook_id, is_pinned, created_at, updated_at, deleted_at, revision, device_id";

const NOTE_SUMMARY_COLUMNS =
  "id, title, content_text, notebook_id, is_pinned, created_at, updated_at, deleted_at";

/** Columns a caller may change through `updateNote`, keyed by input field. */
const UPDATABLE_COLUMNS: Record<keyof UpdateNoteInput, string> = {
  title: "title",
  contentJson: "content_json",
  contentText: "content_text",
  notebookId: "notebook_id",
  isPinned: "is_pinned",
};

function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    contentJson: row.content_json,
    contentText: row.content_text,
    notebookId: row.notebook_id,
    isPinned: row.is_pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    revision: row.revision,
    deviceId: row.device_id,
  };
}

function mapNoteSummary(row: NoteSummaryRow): NoteSummary {
  return {
    id: row.id,
    title: row.title,
    contentText: row.content_text,
    notebookId: row.notebook_id,
    isPinned: row.is_pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function rethrowAsDatabaseError(cause: unknown, message: string): never {
  if (cause instanceof DatabaseError) {
    throw cause;
  }

  throw new DatabaseError(message, cause);
}

export async function createNote(input: CreateNoteInput = {}): Promise<Note> {
  try {
    const database = await initializeDatabase();
    const deviceId = await ensureDeviceId();
    const id = createId();
    const timestamp = nowIso();

    await database.execute(
      `INSERT INTO notes
         (id, title, content_json, content_text, notebook_id, is_pinned, created_at, updated_at, deleted_at, revision, device_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, NULL, 1, $8)`,
      [
        id,
        input.title ?? "",
        input.contentJson ?? EMPTY_NOTE_CONTENT_JSON,
        input.contentText ?? "",
        input.notebookId ?? null,
        input.isPinned ? 1 : 0,
        timestamp,
        deviceId,
      ],
    );

    const created = await getNoteById(id);
    if (!created) {
      throw new DatabaseError(
        "The new note could not be read back after saving.",
      );
    }

    return created;
  } catch (cause) {
    rethrowAsDatabaseError(cause, "Could not create the note.");
  }
}

export async function getNoteById(id: string): Promise<Note | null> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<NoteRow[]>(
      `SELECT ${NOTE_COLUMNS} FROM notes WHERE id = $1`,
      [id],
    );

    const row = rows[0];
    return row ? mapNote(row) : null;
  } catch (cause) {
    rethrowAsDatabaseError(cause, `Could not read note ${id}.`);
  }
}

export async function listNotes(
  input: ListNotesInput = {},
): Promise<NoteSummary[]> {
  try {
    const database = await initializeDatabase();
    const clauses: string[] = [];
    const values: unknown[] = [];
    let position = 1;

    const deleted = input.deleted ?? "exclude";
    if (deleted === "exclude") {
      clauses.push("deleted_at IS NULL");
    } else if (deleted === "only") {
      clauses.push("deleted_at IS NOT NULL");
    }

    if (input.notebookId === null) {
      clauses.push("notebook_id IS NULL");
    } else if (input.notebookId !== undefined) {
      clauses.push(`notebook_id = $${position}`);
      position += 1;
      values.push(input.notebookId);
    }

    if (input.tagId !== undefined) {
      clauses.push(
        `EXISTS (SELECT 1 FROM note_tags WHERE note_tags.note_id = notes.id AND note_tags.tag_id = $${position})`,
      );
      position += 1;
      values.push(input.tagId);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    let sql = `SELECT ${NOTE_SUMMARY_COLUMNS} FROM notes ${where} ORDER BY updated_at DESC, created_at DESC`;

    if (input.limit !== undefined) {
      sql += ` LIMIT $${position}`;
      position += 1;
      values.push(input.limit);
    }

    if (input.offset !== undefined) {
      sql += ` OFFSET $${position}`;
      position += 1;
      values.push(input.offset);
    }

    const rows = await database.select<NoteSummaryRow[]>(sql, values);
    return rows.map(mapNoteSummary);
  } catch (cause) {
    rethrowAsDatabaseError(cause, "Could not list notes.");
  }
}

export async function updateNote(
  id: string,
  patch: UpdateNoteInput = {},
): Promise<Note> {
  try {
    const database = await initializeDatabase();
    const sets: string[] = [];
    const values: unknown[] = [];
    let position = 1;

    for (const key of Object.keys(UPDATABLE_COLUMNS) as Array<
      keyof UpdateNoteInput
    >) {
      const value = patch[key];
      if (value === undefined) {
        continue;
      }

      sets.push(`${UPDATABLE_COLUMNS[key]} = $${position}`);
      position += 1;
      values.push(key === "isPinned" ? (value ? 1 : 0) : value);
    }

    sets.push(`updated_at = $${position}`);
    position += 1;
    values.push(nowIso());
    values.push(id);

    const result = await database.execute(
      `UPDATE notes SET ${sets.join(", ")}, revision = revision + 1 WHERE id = $${position}`,
      values,
    );

    if (result.rowsAffected === 0) {
      throw new DatabaseError(`Note ${id} was not found.`);
    }

    const updated = await getNoteById(id);
    if (!updated) {
      throw new DatabaseError(`Note ${id} was not found.`);
    }

    return updated;
  } catch (cause) {
    rethrowAsDatabaseError(cause, "Could not update the note.");
  }
}

/**
 * Move a note to the Trash. Preserves the record and its body, bumps
 * `revision`/`updated_at`. A no-op when the note is missing or already trashed.
 */
export async function softDeleteNote(id: string): Promise<void> {
  try {
    const database = await initializeDatabase();
    const timestamp = nowIso();
    await database.execute(
      "UPDATE notes SET deleted_at = $1, updated_at = $2, revision = revision + 1 WHERE id = $3 AND deleted_at IS NULL",
      [timestamp, timestamp, id],
    );
  } catch (cause) {
    rethrowAsDatabaseError(cause, "Could not move the note to Trash.");
  }
}

/** Return a trashed note to the active list. A no-op when it is not trashed. */
export async function restoreNote(id: string): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute(
      "UPDATE notes SET deleted_at = NULL, updated_at = $1, revision = revision + 1 WHERE id = $2 AND deleted_at IS NOT NULL",
      [nowIso(), id],
    );
  } catch (cause) {
    rethrowAsDatabaseError(cause, "Could not restore the note.");
  }
}

/**
 * Permanently remove a note. Cascades to `note_tags` and `attachments` rows via
 * foreign keys. Irreversible — callers must confirm with the user first.
 */
export async function permanentlyDeleteNote(id: string): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute("DELETE FROM notes WHERE id = $1", [id]);
  } catch (cause) {
    rethrowAsDatabaseError(cause, "Could not permanently delete the note.");
  }
}

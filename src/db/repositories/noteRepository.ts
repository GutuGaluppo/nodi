import type Database from "@tauri-apps/plugin-sql";
import {
  decryptNotePayload,
  encryptNotePayload,
  type PrivateNotePayload,
} from "../../lib/crypto/noteCipher";
import { DatabaseError } from "../../lib/errors/DatabaseError";
import { createId } from "../../lib/ids/id";
import { initializeDatabase } from "../database";
import { ensureDeviceId } from "../deviceId";
import { getPrivateNoteKey } from "../privateNoteKey";

/**
 * The only place note rows are read or written.
 *
 * UI components, the editor, and stores must call these functions rather than
 * issuing SQL. Every statement is parameterized. `content_json` (Tiptap JSON) is
 * the canonical note body; `content_text` is a caller-supplied plain-text
 * projection used for previews and, later, full-text search.
 *
 * Private notes are encrypted at rest once private notes have been unlocked:
 * their title and body live in `encrypted_payload`, and the plaintext columns
 * hold empty values. Reads decrypt with the session key; without it, the note
 * comes back with `isLocked` set and no content.
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
  isPrivate?: boolean;
  /** True when the note is encrypted and private notes are not unlocked. */
  isLocked?: boolean;
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
  isPrivate?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Set by search when the note matched only through text in an image. */
  matchedInImage?: boolean;
}

export interface CreateNoteInput {
  title?: string;
  contentJson?: string;
  contentText?: string;
  notebookId?: string | null;
  isPinned?: boolean;
  isPrivate?: boolean;
}

export interface UpdateNoteInput {
  title?: string;
  contentJson?: string;
  contentText?: string;
  notebookId?: string | null;
  isPinned?: boolean;
  isPrivate?: boolean;
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
  is_private: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  revision: number;
  device_id: string;
  encrypted_payload: string | null;
}

type NoteSummaryRow = Omit<
  NoteRow,
  "content_json" | "revision" | "device_id" | "encrypted_payload"
>;

const NOTE_COLUMNS =
  "id, title, content_json, content_text, notebook_id, is_pinned, is_private, created_at, updated_at, deleted_at, revision, device_id, encrypted_payload";

const NOTE_SUMMARY_COLUMNS =
  "id, title, content_text, notebook_id, is_pinned, is_private, created_at, updated_at, deleted_at";

/** Columns a caller may change through `updateNote`, keyed by input field. */
const UPDATABLE_COLUMNS: Record<keyof UpdateNoteInput, string> = {
  title: "title",
  contentJson: "content_json",
  contentText: "content_text",
  notebookId: "notebook_id",
  isPinned: "is_pinned",
  isPrivate: "is_private",
};

/** Fields that are sealed inside `encrypted_payload` for private notes. */
const SEALED_FIELDS = ["title", "contentJson", "contentText"] as const;

const LOCKED_ERROR = "Unlock private notes to change this note.";

function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    contentJson: row.content_json,
    contentText: row.content_text,
    notebookId: row.notebook_id,
    isPinned: row.is_pinned === 1,
    isPrivate: row.is_private === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    revision: row.revision,
    deviceId: row.device_id,
  };
}

/** Maps a row and, for an encrypted note, opens it with the session key. */
async function readNote(row: NoteRow): Promise<Note> {
  const note = mapNote(row);
  if (!row.encrypted_payload) {
    return note;
  }
  const key = getPrivateNoteKey();
  if (key === null) {
    return { ...note, isLocked: true };
  }
  const payload = await decryptNotePayload(key, row.id, row.encrypted_payload);
  return { ...note, ...payload };
}

function plaintextPayload(row: NoteRow): PrivateNotePayload {
  return {
    title: row.title,
    contentJson: row.content_json,
    contentText: row.content_text,
  };
}

/**
 * Removes plaintext that SQLite may still hold after a note was encrypted:
 * deleted FTS5 entries, free pages, and the write-ahead log. Best effort — the
 * note itself is already encrypted when this runs.
 */
async function scrubDeletedPlaintext(database: Database): Promise<void> {
  try {
    await database.execute(
      "INSERT INTO notes_fts (notes_fts) VALUES ('optimize')",
    );
    await database.execute("VACUUM");
    await database.select("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (cause) {
    console.error(
      "NODI could not compact the database after encryption",
      cause,
    );
  }
}

function mapNoteSummary(row: NoteSummaryRow): NoteSummary {
  return {
    id: row.id,
    title: row.title,
    contentText: row.content_text,
    notebookId: row.notebook_id,
    isPinned: row.is_pinned === 1,
    isPrivate: row.is_private === 1,
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
    const key = input.isPrivate ? getPrivateNoteKey() : null;
    const payload: PrivateNotePayload = {
      title: input.title ?? "",
      contentJson: input.contentJson ?? EMPTY_NOTE_CONTENT_JSON,
      contentText: input.contentText ?? "",
    };
    const sealed = key ? await encryptNotePayload(key, id, payload) : null;

    await database.execute(
      `INSERT INTO notes
         (id, title, content_json, content_text, notebook_id, is_pinned, is_private, created_at, updated_at, deleted_at, revision, device_id, encrypted_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NULL, 1, $9, $10)`,
      [
        id,
        sealed ? "" : payload.title,
        sealed ? EMPTY_NOTE_CONTENT_JSON : payload.contentJson,
        sealed ? "" : payload.contentText,
        input.notebookId ?? null,
        input.isPinned ? 1 : 0,
        input.isPrivate ? 1 : 0,
        timestamp,
        deviceId,
        sealed,
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
    return row ? await readNote(row) : null;
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

/** Search the synchronized FTS5 projection and order active notes by relevance. */
export function toFtsQuery(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(" AND ");
}

export interface SearchFilters {
  tag?: string;
  notebook?: string;
  created?: string;
  updated?: string;
}

/** WHERE clauses shared by note-text and image-text search. */
function searchClauses(
  matchTable: "notes_fts" | "attachment_text_fts",
  normalized: string,
  filters: SearchFilters,
): { clauses: string[]; values: unknown[]; position: number } {
  const clauses = ["notes.deleted_at IS NULL", "notes.is_private = 0"];
  const values: unknown[] = [];
  let position = 1;

  if (normalized) {
    clauses.push(`${matchTable} MATCH $${position}`);
    values.push(normalized);
    position += 1;
  }
  if (filters.tag) {
    clauses.push(
      `EXISTS (
        SELECT 1 FROM note_tags
        INNER JOIN tags ON tags.id = note_tags.tag_id
        WHERE note_tags.note_id = notes.id AND tags.name = $${position} COLLATE NOCASE
      )`,
    );
    values.push(filters.tag);
    position += 1;
  }
  if (filters.notebook) {
    clauses.push(`notebooks.name = $${position} COLLATE NOCASE`);
    values.push(filters.notebook);
    position += 1;
  }
  if (filters.created) {
    clauses.push(`date(notes.created_at) = date($${position})`);
    values.push(filters.created);
    position += 1;
  }
  if (filters.updated) {
    clauses.push(`date(notes.updated_at) = date($${position})`);
    values.push(filters.updated);
    position += 1;
  }
  return { clauses, values, position };
}

const SUMMARY_COLUMNS = `notes.id, notes.title, notes.content_text, notes.notebook_id, notes.is_pinned, notes.is_private,
              notes.created_at, notes.updated_at, notes.deleted_at`;

/**
 * Searches note text, tags, and notebooks, then text recognized in images
 * (OCR-002). Notes found only through an image come after the others and are
 * marked `matchedInImage`.
 */
export async function searchNotes(
  query: string,
  filters: SearchFilters = {},
  limit = 50,
): Promise<NoteSummary[]> {
  try {
    const normalized = toFtsQuery(query);
    if (!normalized && Object.values(filters).every((value) => !value)) {
      return [];
    }
    const database = await initializeDatabase();
    const main = searchClauses("notes_fts", normalized, filters);
    const rows = await database.select<NoteSummaryRow[]>(
      `SELECT ${SUMMARY_COLUMNS}
       FROM notes_fts
       INNER JOIN notes ON notes.id = notes_fts.note_id
       LEFT JOIN notebooks ON notebooks.id = notes.notebook_id
       WHERE ${main.clauses.join(" AND ")}
       ORDER BY ${normalized ? "bm25(notes_fts, 0.0, 5.0, 2.0, 1.5, 1.5)," : ""} notes.updated_at DESC
       LIMIT $${main.position}`,
      [...main.values, limit],
    );
    const results: NoteSummary[] = rows.map(mapNoteSummary);
    if (!normalized || results.length >= limit) {
      return results;
    }

    const image = searchClauses("attachment_text_fts", normalized, filters);
    // One note can hold several matching images.
    const imageRows = await database.select<NoteSummaryRow[]>(
      `SELECT DISTINCT ${SUMMARY_COLUMNS}
       FROM attachment_text_fts
       INNER JOIN attachments ON attachments.id = attachment_text_fts.attachment_id
       INNER JOIN notes ON notes.id = attachments.note_id
       LEFT JOIN notebooks ON notebooks.id = notes.notebook_id
       WHERE ${image.clauses.join(" AND ")}
       ORDER BY notes.updated_at DESC
       LIMIT $${image.position}`,
      [...image.values, limit],
    );
    const found = new Set(results.map((note) => note.id));
    for (const row of imageRows) {
      if (results.length >= limit) break;
      if (found.has(row.id)) continue;
      found.add(row.id);
      results.push({ ...mapNoteSummary(row), matchedInImage: true });
    }
    return results;
  } catch (cause) {
    rethrowAsDatabaseError(cause, "Could not search notes.");
  }
}

export async function updateNote(
  id: string,
  patch: UpdateNoteInput = {},
): Promise<Note> {
  try {
    const database = await initializeDatabase();
    const changes = new Map<keyof UpdateNoteInput, unknown>();
    for (const key of Object.keys(UPDATABLE_COLUMNS) as Array<
      keyof UpdateNoteInput
    >) {
      if (patch[key] !== undefined) {
        changes.set(key, patch[key]);
      }
    }

    // Only a change to the sealed fields or to privacy needs the current row.
    const touchesPrivacy =
      patch.isPrivate !== undefined ||
      SEALED_FIELDS.some((field) => patch[field] !== undefined);
    let encryptedPayload: string | null | undefined;
    let scrub = false;

    if (touchesPrivacy) {
      const rows = await database.select<NoteRow[]>(
        `SELECT ${NOTE_COLUMNS} FROM notes WHERE id = $1`,
        [id],
      );
      const current = rows[0];
      if (!current) {
        throw new DatabaseError(`Note ${id} was not found.`);
      }
      const wasEncrypted = Boolean(current.encrypted_payload);
      const willBePrivate = patch.isPrivate ?? current.is_private === 1;
      const key = getPrivateNoteKey();

      if (wasEncrypted || (willBePrivate && key !== null)) {
        if (key === null) {
          throw new DatabaseError(LOCKED_ERROR);
        }
        const base = wasEncrypted
          ? await decryptNotePayload(key, id, current.encrypted_payload ?? "")
          : plaintextPayload(current);
        const merged: PrivateNotePayload = {
          title: patch.title ?? base.title,
          contentJson: patch.contentJson ?? base.contentJson,
          contentText: patch.contentText ?? base.contentText,
        };

        if (willBePrivate) {
          encryptedPayload = await encryptNotePayload(key, id, merged);
          changes.set("title", "");
          changes.set("contentJson", EMPTY_NOTE_CONTENT_JSON);
          changes.set("contentText", "");
          scrub = !wasEncrypted;
        } else {
          encryptedPayload = null;
          changes.set("title", merged.title);
          changes.set("contentJson", merged.contentJson);
          changes.set("contentText", merged.contentText);
        }
      }
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let position = 1;

    for (const [key, value] of changes) {
      sets.push(`${UPDATABLE_COLUMNS[key]} = $${position}`);
      position += 1;
      values.push(
        key === "isPinned" || key === "isPrivate" ? (value ? 1 : 0) : value,
      );
    }

    if (encryptedPayload !== undefined) {
      sets.push(`encrypted_payload = $${position}`);
      position += 1;
      values.push(encryptedPayload);
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

    if (scrub) {
      await scrubDeletedPlaintext(database);
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
 * Encrypts private notes that are still stored in plaintext: notes made
 * private while locked, and private notes from before encryption existed.
 * Requires the session key. Returns how many notes were encrypted.
 */
export async function encryptPendingPrivateNotes(): Promise<number> {
  try {
    const key = getPrivateNoteKey();
    if (key === null) {
      throw new DatabaseError(LOCKED_ERROR);
    }
    const database = await initializeDatabase();
    const rows = await database.select<NoteRow[]>(
      `SELECT ${NOTE_COLUMNS} FROM notes WHERE is_private = 1 AND encrypted_payload IS NULL`,
    );

    for (const row of rows) {
      await database.execute(
        `UPDATE notes
         SET encrypted_payload = $1, title = '', content_json = $2, content_text = ''
         WHERE id = $3 AND encrypted_payload IS NULL`,
        [
          await encryptNotePayload(key, row.id, plaintextPayload(row)),
          EMPTY_NOTE_CONTENT_JSON,
          row.id,
        ],
      );
    }

    if (rows.length > 0) {
      await scrubDeletedPlaintext(database);
    }
    return rows.length;
  } catch (cause) {
    rethrowAsDatabaseError(cause, "Could not encrypt private notes.");
  }
}

/** Private notes sealed with the note key, including those in the Trash. */
export async function countEncryptedPrivateNotes(): Promise<number> {
  try {
    const database = await initializeDatabase();
    const [row] = await database.select<{ count: number }[]>(
      "SELECT COUNT(*) AS count FROM notes WHERE is_private = 1 AND encrypted_payload IS NOT NULL",
    );
    return row?.count ?? 0;
  } catch (cause) {
    rethrowAsDatabaseError(cause, "Could not count private notes.");
  }
}

/**
 * Permanently removes every encrypted private note, for starting over after
 * the password and the recovery key are both lost: without the note key they
 * can never be read again. Private notes still in plaintext are kept, and are
 * encrypted with the next key. Irreversible — callers must confirm first.
 */
export async function deleteEncryptedPrivateNotes(): Promise<number> {
  try {
    const database = await initializeDatabase();
    const result = await database.execute(
      "DELETE FROM notes WHERE is_private = 1 AND encrypted_payload IS NOT NULL",
    );
    if (result.rowsAffected > 0) {
      await scrubDeletedPlaintext(database);
    }
    return result.rowsAffected;
  } catch (cause) {
    rethrowAsDatabaseError(cause, "Could not delete the private notes.");
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

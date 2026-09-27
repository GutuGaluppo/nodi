import { DatabaseError } from "../../lib/errors/DatabaseError";
import { initializeDatabase } from "../database";

/** A note ready to leave the database as a file: never private, never trashed. */
export interface ExportableNote {
  id: string;
  title: string;
  contentJson: string;
  contentText: string;
  notebook: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface ExportableRow {
  id: string;
  title: string;
  content_json: string;
  content_text: string;
  notebook: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Lists every note that may be exported or mirrored. Private notes are left
 * out entirely: their content must never be written anywhere in plaintext.
 */
export async function listExportableNotes(): Promise<ExportableNote[]> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<ExportableRow[]>(
      `SELECT notes.id, notes.title, notes.content_json, notes.content_text, notebooks.name AS notebook,
              (SELECT group_concat(tags.name, char(31))
               FROM note_tags INNER JOIN tags ON tags.id = note_tags.tag_id
               WHERE note_tags.note_id = notes.id) AS tags,
              notes.created_at, notes.updated_at
       FROM notes
       LEFT JOIN notebooks ON notebooks.id = notes.notebook_id AND notebooks.deleted_at IS NULL
       WHERE notes.deleted_at IS NULL AND notes.is_private = 0
       ORDER BY notes.created_at, notes.id`,
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      contentJson: row.content_json,
      contentText: row.content_text,
      notebook: row.notebook,
      tags: row.tags ? row.tags.split("\u001f").sort() : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (cause) {
    if (cause instanceof DatabaseError) throw cause;
    throw new DatabaseError("Could not read notes for export.", cause);
  }
}

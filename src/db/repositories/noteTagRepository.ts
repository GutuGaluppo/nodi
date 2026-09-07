import { DatabaseError } from "../../lib/errors/DatabaseError";
import { initializeDatabase } from "../database";
import type { Tag } from "./tagRepository";

interface TagRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function rethrow(cause: unknown, message: string): never {
  if (cause instanceof DatabaseError) throw cause;
  throw new DatabaseError(message, cause);
}

export async function listTagsForNote(noteId: string): Promise<Tag[]> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<TagRow[]>(
      `SELECT tags.id, tags.name, tags.created_at, tags.updated_at
       FROM tags
       INNER JOIN note_tags ON note_tags.tag_id = tags.id
       WHERE note_tags.note_id = $1
       ORDER BY tags.name COLLATE NOCASE`,
      [noteId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (cause) {
    rethrow(cause, "Could not load this note's tags.");
  }
}

export async function addTagToNote(
  noteId: string,
  tagId: string,
): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute(
      "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES ($1, $2)",
      [noteId, tagId],
    );
  } catch (cause) {
    rethrow(cause, "Could not add the tag to this note.");
  }
}

export async function removeTagFromNote(
  noteId: string,
  tagId: string,
): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute(
      "DELETE FROM note_tags WHERE note_id = $1 AND tag_id = $2",
      [noteId, tagId],
    );
  } catch (cause) {
    rethrow(cause, "Could not remove the tag from this note.");
  }
}

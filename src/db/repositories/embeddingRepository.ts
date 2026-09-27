import { DatabaseError } from "../../lib/errors/DatabaseError";
import { initializeDatabase } from "../database";

/** A note whose embedding is missing or older than its last edit. */
export interface StaleNote {
  id: string;
  text: string;
  updatedAt: string;
}

export interface StoredEmbedding {
  noteId: string;
  title: string;
  language: string | null;
  /** Base64 float32 vector; empty when the language has no embedding. */
  vector: string;
}

export interface EmbeddingToSave {
  noteId: string;
  language: string | null;
  vector: string;
  sourceUpdatedAt: string;
}

function rethrow(cause: unknown, message: string): never {
  if (cause instanceof DatabaseError) throw cause;
  throw new DatabaseError(message, cause);
}

/** Only active notes that are not private are ever embedded. */
const ELIGIBLE = "notes.deleted_at IS NULL AND notes.is_private = 0";

export async function listStaleNotes(limit = 50): Promise<StaleNote[]> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<
      { id: string; title: string; content_text: string; updated_at: string }[]
    >(
      `SELECT notes.id, notes.title, notes.content_text, notes.updated_at
       FROM notes
       LEFT JOIN note_embeddings ON note_embeddings.note_id = notes.id
       WHERE ${ELIGIBLE}
         AND (note_embeddings.note_id IS NULL
              OR note_embeddings.source_updated_at <> notes.updated_at)
       ORDER BY notes.updated_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      id: row.id,
      text: `${row.title}\n${row.content_text}`.trim(),
      updatedAt: row.updated_at,
    }));
  } catch (cause) {
    rethrow(cause, "Could not list notes waiting for embeddings.");
  }
}

export async function saveEmbeddings(items: EmbeddingToSave[]): Promise<void> {
  try {
    const database = await initializeDatabase();
    for (const item of items) {
      // Skipped when the note became private meanwhile.
      await database.execute(
        `INSERT INTO note_embeddings (note_id, language, vector, source_updated_at)
         SELECT $1, $2, $3, $4 WHERE EXISTS (
           SELECT 1 FROM notes WHERE notes.id = $1 AND notes.is_private = 0
         )
         ON CONFLICT (note_id) DO UPDATE SET
           language = excluded.language,
           vector = excluded.vector,
           source_updated_at = excluded.source_updated_at`,
        [item.noteId, item.language, item.vector, item.sourceUpdatedAt],
      );
    }
  } catch (cause) {
    rethrow(cause, "Could not save embeddings.");
  }
}

export async function listEmbeddings(): Promise<StoredEmbedding[]> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<
      {
        note_id: string;
        title: string;
        language: string | null;
        vector: string;
      }[]
    >(
      `SELECT note_embeddings.note_id, notes.title, note_embeddings.language, note_embeddings.vector
       FROM note_embeddings
       INNER JOIN notes ON notes.id = note_embeddings.note_id
       WHERE ${ELIGIBLE}`,
    );
    return rows.map((row) => ({
      noteId: row.note_id,
      title: row.title,
      language: row.language,
      vector: row.vector,
    }));
  } catch (cause) {
    rethrow(cause, "Could not read embeddings.");
  }
}

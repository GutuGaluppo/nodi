import { DatabaseError } from "../../lib/errors/DatabaseError";
import { initializeDatabase } from "../database";

/** An image attachment whose text has not been recognized yet. */
export interface PendingImage {
  attachmentId: string;
  relativePath: string;
}

export interface ImageTextStatus {
  recognized: number;
  waiting: number;
}

function rethrow(cause: unknown, message: string): never {
  if (cause instanceof DatabaseError) throw cause;
  throw new DatabaseError(message, cause);
}

/** Only images in active notes that are not private are ever recognized. */
const ELIGIBLE_IMAGES = `
  FROM attachments
  INNER JOIN notes ON notes.id = attachments.note_id
  WHERE attachments.mime_type LIKE 'image/%'
    AND notes.deleted_at IS NULL
    AND notes.is_private = 0`;

export async function listPendingImages(): Promise<PendingImage[]> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<{ id: string; relative_path: string }[]>(
      `SELECT attachments.id, attachments.relative_path ${ELIGIBLE_IMAGES}
         AND NOT EXISTS (
           SELECT 1 FROM attachment_text WHERE attachment_text.attachment_id = attachments.id
         )
       ORDER BY attachments.created_at`,
    );
    return rows.map((row) => ({
      attachmentId: row.id,
      relativePath: row.relative_path,
    }));
  } catch (cause) {
    rethrow(cause, "Could not list images waiting for text recognition.");
  }
}

/** Stores recognized text; an empty string marks an image without text. */
export async function saveAttachmentText(
  attachmentId: string,
  text: string,
): Promise<void> {
  try {
    const database = await initializeDatabase();
    // Skipped when the note became private meanwhile: its text must not be kept.
    await database.execute(
      `INSERT INTO attachment_text (attachment_id, text, recognized_at)
       SELECT $1, $2, $3 WHERE EXISTS (
         SELECT 1 FROM attachments
         INNER JOIN notes ON notes.id = attachments.note_id
         WHERE attachments.id = $1 AND notes.is_private = 0
       )
       ON CONFLICT (attachment_id) DO UPDATE SET text = excluded.text, recognized_at = excluded.recognized_at`,
      [attachmentId, text.trim(), new Date().toISOString()],
    );
  } catch (cause) {
    rethrow(cause, "Could not save the recognized text.");
  }
}

export async function getImageTextStatus(): Promise<ImageTextStatus> {
  try {
    const database = await initializeDatabase();
    const [row] = await database.select<
      { recognized: number | null; waiting: number | null }[]
    >(
      `SELECT
         SUM(CASE WHEN EXISTS (SELECT 1 FROM attachment_text WHERE attachment_text.attachment_id = attachments.id) THEN 1 ELSE 0 END) AS recognized,
         SUM(CASE WHEN EXISTS (SELECT 1 FROM attachment_text WHERE attachment_text.attachment_id = attachments.id) THEN 0 ELSE 1 END) AS waiting
       ${ELIGIBLE_IMAGES}`,
    );
    return {
      recognized: row?.recognized ?? 0,
      waiting: row?.waiting ?? 0,
    };
  } catch (cause) {
    rethrow(cause, "Could not read the image text status.");
  }
}

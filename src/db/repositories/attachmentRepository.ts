import { DatabaseError } from "../../lib/errors/DatabaseError";
import { createId } from "../../lib/ids/id";
import { initializeDatabase } from "../database";

/**
 * Attachment metadata (ATT-002). The files themselves live outside SQLite,
 * under the app data directory; `relativePath` points at them. Rows cascade
 * with their note, and files no row references are swept at launch.
 */
export interface Attachment {
  id: string;
  noteId: string;
  filename: string;
  mimeType: string | null;
  relativePath: string;
  sha256: string;
  size: number;
  createdAt: string;
}

export interface CreateAttachmentInput {
  noteId: string;
  filename: string;
  mimeType: string | null;
  relativePath: string;
  sha256: string;
  size: number;
}

interface AttachmentRow {
  id: string;
  note_id: string;
  filename: string;
  mime_type: string | null;
  relative_path: string;
  sha256: string;
  size: number;
  created_at: string;
}

const COLUMNS =
  "id, note_id, filename, mime_type, relative_path, sha256, size, created_at";

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    noteId: row.note_id,
    filename: row.filename,
    mimeType: row.mime_type,
    relativePath: row.relative_path,
    sha256: row.sha256,
    size: row.size,
    createdAt: row.created_at,
  };
}

function rethrow(cause: unknown, message: string): never {
  if (cause instanceof DatabaseError) throw cause;
  throw new DatabaseError(message, cause);
}

/** Relative paths must stay inside the attachments directory. */
function assertSafePath(relativePath: string): void {
  if (
    !relativePath.startsWith("attachments/") ||
    relativePath.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new DatabaseError(`Refusing attachment path ${relativePath}.`);
  }
}

export async function createAttachment(
  input: CreateAttachmentInput,
): Promise<Attachment> {
  try {
    assertSafePath(input.relativePath);
    const database = await initializeDatabase();
    const attachment: Attachment = {
      id: createId(),
      createdAt: new Date().toISOString(),
      ...input,
    };
    await database.execute(
      `INSERT INTO attachments (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        attachment.id,
        attachment.noteId,
        attachment.filename,
        attachment.mimeType,
        attachment.relativePath,
        attachment.sha256,
        attachment.size,
        attachment.createdAt,
      ],
    );
    return attachment;
  } catch (cause) {
    rethrow(cause, "Could not save the attachment.");
  }
}

export async function getAttachment(id: string): Promise<Attachment | null> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<AttachmentRow[]>(
      `SELECT ${COLUMNS} FROM attachments WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapAttachment(rows[0]) : null;
  } catch (cause) {
    rethrow(cause, `Could not read attachment ${id}.`);
  }
}

/** How many files a note carries, to warn before it becomes private. */
export async function countAttachments(noteId: string): Promise<number> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<{ count: number }[]>(
      "SELECT COUNT(*) AS count FROM attachments WHERE note_id = $1",
      [noteId],
    );
    return rows[0]?.count ?? 0;
  } catch (cause) {
    rethrow(cause, "Could not count the note's attachments.");
  }
}

/** Every stored file path still referenced, for the launch-time sweep. */
export async function listAttachmentPaths(): Promise<string[]> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<{ relative_path: string }[]>(
      "SELECT DISTINCT relative_path FROM attachments",
    );
    return rows.map((row) => row.relative_path);
  } catch (cause) {
    rethrow(cause, "Could not list attachments.");
  }
}

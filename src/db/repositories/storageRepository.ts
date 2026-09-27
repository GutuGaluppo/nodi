import { DatabaseError } from "../../lib/errors/DatabaseError";
import { initializeDatabase } from "../database";

/** A read-only snapshot of the local database, for the "Your data" panel. */
export interface StorageReport {
  sizeBytes: number;
  /** "ok", or the problems SQLite's quick check reported. */
  integrity: string[];
  activeNotes: number;
  trashedNotes: number;
  encryptedPrivateNotes: number;
  /** Private notes still stored in plaintext until the next unlock. */
  pendingPrivateNotes: number;
}

interface SizeRow {
  size_bytes: number;
}

interface CountsRow {
  active_notes: number | null;
  trashed_notes: number | null;
  encrypted_private_notes: number | null;
  pending_private_notes: number | null;
}

interface QuickCheckRow {
  quick_check: string;
}

export async function getStorageReport(): Promise<StorageReport> {
  try {
    const database = await initializeDatabase();
    const [size] = await database.select<SizeRow[]>(
      `SELECT (SELECT page_count FROM pragma_page_count()) * (SELECT page_size FROM pragma_page_size()) AS size_bytes`,
    );
    const [counts] = await database.select<CountsRow[]>(
      `SELECT
         SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS active_notes,
         SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trashed_notes,
         SUM(CASE WHEN is_private = 1 AND encrypted_payload IS NOT NULL THEN 1 ELSE 0 END) AS encrypted_private_notes,
         SUM(CASE WHEN is_private = 1 AND encrypted_payload IS NULL THEN 1 ELSE 0 END) AS pending_private_notes
       FROM notes`,
    );
    const check = await database.select<QuickCheckRow[]>("PRAGMA quick_check");

    return {
      sizeBytes: size?.size_bytes ?? 0,
      integrity: check.map((row) => row.quick_check),
      activeNotes: counts?.active_notes ?? 0,
      trashedNotes: counts?.trashed_notes ?? 0,
      encryptedPrivateNotes: counts?.encrypted_private_notes ?? 0,
      pendingPrivateNotes: counts?.pending_private_notes ?? 0,
    };
  } catch (cause) {
    if (cause instanceof DatabaseError) throw cause;
    throw new DatabaseError("Could not read the storage report.", cause);
  }
}

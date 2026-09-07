import { DatabaseError } from "../../lib/errors/DatabaseError";
import { createId } from "../../lib/ids/id";
import { initializeDatabase } from "../database";

export type ShortcutTargetType = "note" | "notebook";

export interface Shortcut {
  id: string;
  targetType: ShortcutTargetType;
  targetId: string;
  label: string;
  sortOrder: number;
  createdAt: string;
}

interface ShortcutRow {
  id: string;
  target_type: ShortcutTargetType;
  target_id: string;
  label: string;
  sort_order: number;
  created_at: string;
}

function rethrow(cause: unknown, message: string): never {
  if (cause instanceof DatabaseError) throw cause;
  throw new DatabaseError(message, cause);
}

export async function listShortcuts(): Promise<Shortcut[]> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<ShortcutRow[]>(
      `SELECT shortcuts.id, shortcuts.target_type, shortcuts.target_id,
        CASE shortcuts.target_type
          WHEN 'note' THEN COALESCE(NULLIF(notes.title, ''), 'Untitled')
          ELSE notebooks.name
        END AS label,
        shortcuts.sort_order, shortcuts.created_at
       FROM shortcuts
       LEFT JOIN notes ON shortcuts.target_type = 'note' AND notes.id = shortcuts.target_id
       LEFT JOIN notebooks ON shortcuts.target_type = 'notebook' AND notebooks.id = shortcuts.target_id
       WHERE (shortcuts.target_type = 'note' AND notes.id IS NOT NULL AND notes.deleted_at IS NULL)
          OR (shortcuts.target_type = 'notebook' AND notebooks.id IS NOT NULL AND notebooks.deleted_at IS NULL)
       ORDER BY shortcuts.sort_order, shortcuts.created_at`,
    );
    return rows.map((row) => ({
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      label: row.label,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    }));
  } catch (cause) {
    rethrow(cause, "Could not load shortcuts.");
  }
}

export async function addShortcut(
  targetType: ShortcutTargetType,
  targetId: string,
): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute(
      `INSERT OR IGNORE INTO shortcuts (id, target_type, target_id, sort_order, created_at)
       SELECT $1, $2, $3, COALESCE(MAX(sort_order), -1) + 1, $4 FROM shortcuts`,
      [createId(), targetType, targetId, new Date().toISOString()],
    );
  } catch (cause) {
    rethrow(cause, "Could not add the shortcut.");
  }
}

export async function removeShortcut(
  targetType: ShortcutTargetType,
  targetId: string,
): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute(
      "DELETE FROM shortcuts WHERE target_type = $1 AND target_id = $2",
      [targetType, targetId],
    );
  } catch (cause) {
    rethrow(cause, "Could not remove the shortcut.");
  }
}

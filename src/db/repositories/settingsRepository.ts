import { DatabaseError } from "../../lib/errors/DatabaseError";
import { initializeDatabase } from "../database";

/**
 * Key/value access to the `settings` table.
 *
 * The table holds small, stable application values such as the local device
 * identifier and the persisted schema version. Callers outside `src/db` must go
 * through a repository rather than issuing SQL directly.
 */
export async function getSetting(key: string): Promise<string | null> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<Array<{ value: string }>>(
      "SELECT value FROM settings WHERE key = $1",
      [key],
    );

    return rows[0]?.value ?? null;
  } catch (cause) {
    if (cause instanceof DatabaseError) {
      throw cause;
    }

    throw new DatabaseError(`Could not read the "${key}" setting.`, cause);
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  } catch (cause) {
    if (cause instanceof DatabaseError) {
      throw cause;
    }

    throw new DatabaseError(`Could not save the "${key}" setting.`, cause);
  }
}

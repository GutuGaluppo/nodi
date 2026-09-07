import { DatabaseError } from "../../lib/errors/DatabaseError";
import { createId } from "../../lib/ids/id";
import { initializeDatabase } from "../database";

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface TagRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new DatabaseError("A tag name is required.");
  return normalized;
}

function rethrow(cause: unknown, message: string): never {
  if (cause instanceof DatabaseError) throw cause;
  throw new DatabaseError(message, cause);
}

export async function listTags(): Promise<Tag[]> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<TagRow[]>(
      "SELECT id, name, created_at, updated_at FROM tags ORDER BY name COLLATE NOCASE, created_at",
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (cause) {
    rethrow(cause, "Could not load tags.");
  }
}

export async function createTag(name: string): Promise<Tag> {
  try {
    const database = await initializeDatabase();
    const id = createId();
    const timestamp = new Date().toISOString();
    const normalizedName = normalizeName(name);
    await database.execute(
      "INSERT INTO tags (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)",
      [id, normalizedName, timestamp],
    );
    return {
      id,
      name: normalizedName,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  } catch (cause) {
    rethrow(cause, "Could not create the tag. Tag names must be unique.");
  }
}

export async function renameTag(id: string, name: string): Promise<void> {
  try {
    const database = await initializeDatabase();
    const result = await database.execute(
      "UPDATE tags SET name = $1, updated_at = $2 WHERE id = $3",
      [normalizeName(name), new Date().toISOString(), id],
    );
    if (result.rowsAffected === 0)
      throw new DatabaseError("The tag was not found.");
  } catch (cause) {
    rethrow(cause, "Could not rename the tag. Tag names must be unique.");
  }
}

export async function deleteTag(id: string): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute("DELETE FROM tags WHERE id = $1", [id]);
  } catch (cause) {
    rethrow(cause, "Could not delete the tag.");
  }
}

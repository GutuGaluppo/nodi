import { DatabaseError } from "../../lib/errors/DatabaseError";
import { createId } from "../../lib/ids/id";
import { initializeDatabase } from "../database";

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: string;
  updatedAt: string;
}

interface SavedSearchRow {
  id: string;
  name: string;
  query: string;
  created_at: string;
  updated_at: string;
}

function required(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) throw new DatabaseError(message);
  return normalized;
}

function rethrow(cause: unknown, message: string): never {
  if (cause instanceof DatabaseError) throw cause;
  throw new DatabaseError(message, cause);
}

export async function listSavedSearches(): Promise<SavedSearch[]> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<SavedSearchRow[]>(
      "SELECT id, name, query, created_at, updated_at FROM saved_searches ORDER BY name COLLATE NOCASE, created_at",
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      query: row.query,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (cause) {
    rethrow(cause, "Could not load saved searches.");
  }
}

export async function createSavedSearch(
  name: string,
  query: string,
): Promise<SavedSearch> {
  try {
    const database = await initializeDatabase();
    const id = createId();
    const timestamp = new Date().toISOString();
    const normalizedName = required(name, "A saved search name is required.");
    const normalizedQuery = required(query, "A search query is required.");
    await database.execute(
      "INSERT INTO saved_searches (id, name, query, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)",
      [id, normalizedName, normalizedQuery, timestamp],
    );
    return {
      id,
      name: normalizedName,
      query: normalizedQuery,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  } catch (cause) {
    rethrow(cause, "Could not save the search.");
  }
}

export async function deleteSavedSearch(id: string): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute("DELETE FROM saved_searches WHERE id = $1", [id]);
  } catch (cause) {
    rethrow(cause, "Could not delete the saved search.");
  }
}

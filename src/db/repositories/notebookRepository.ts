import { DatabaseError } from "../../lib/errors/DatabaseError";
import { createId } from "../../lib/ids/id";
import { initializeDatabase } from "../database";

export interface Notebook {
  id: string;
  name: string;
  stackId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface NotebookRow {
  id: string;
  name: string;
  stack_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function mapNotebook(row: NotebookRow): Notebook {
  return {
    id: row.id,
    name: row.name,
    stackId: row.stack_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new DatabaseError("A notebook name is required.");
  }
  return normalized;
}

function rethrow(cause: unknown, message: string): never {
  if (cause instanceof DatabaseError) {
    throw cause;
  }
  throw new DatabaseError(message, cause);
}

export async function listNotebooks(): Promise<Notebook[]> {
  try {
    const database = await initializeDatabase();
    const rows = await database.select<NotebookRow[]>(
      "SELECT id, name, stack_id, created_at, updated_at, deleted_at FROM notebooks WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE, created_at",
    );
    return rows.map(mapNotebook);
  } catch (cause) {
    rethrow(cause, "Could not load notebooks.");
  }
}

export async function createNotebook(name: string): Promise<Notebook> {
  try {
    const database = await initializeDatabase();
    const id = createId();
    const timestamp = new Date().toISOString();
    await database.execute(
      "INSERT INTO notebooks (id, name, stack_id, created_at, updated_at, deleted_at) VALUES ($1, $2, NULL, $3, $3, NULL)",
      [id, normalizeName(name), timestamp],
    );
    return {
      id,
      name: normalizeName(name),
      stackId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
  } catch (cause) {
    rethrow(cause, "Could not create the notebook.");
  }
}

export async function renameNotebook(id: string, name: string): Promise<void> {
  try {
    const database = await initializeDatabase();
    const result = await database.execute(
      "UPDATE notebooks SET name = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL",
      [normalizeName(name), new Date().toISOString(), id],
    );
    if (result.rowsAffected === 0) {
      throw new DatabaseError("The notebook was not found.");
    }
  } catch (cause) {
    rethrow(cause, "Could not rename the notebook.");
  }
}

export async function deleteNotebook(id: string): Promise<void> {
  try {
    const database = await initializeDatabase();
    await database.execute("DELETE FROM notebooks WHERE id = $1", [id]);
  } catch (cause) {
    rethrow(
      cause,
      "Could not delete the notebook. Move its notes to another notebook first.",
    );
  }
}

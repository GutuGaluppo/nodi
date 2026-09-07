import Database from "@tauri-apps/plugin-sql";
import { DatabaseError } from "../lib/errors/DatabaseError";

const DATABASE_URL = "sqlite:nodi.db";

let databasePromise: Promise<Database> | undefined;

async function openDatabase(): Promise<Database> {
  try {
    const database = await Database.load(DATABASE_URL);

    await database.execute("PRAGMA foreign_keys = ON");
    await database.select("PRAGMA journal_mode = WAL");
    await database.execute("PRAGMA busy_timeout = 5000");

    return database;
  } catch (cause) {
    throw new DatabaseError("Could not open the local NODI database.", cause);
  }
}

export function initializeDatabase(): Promise<Database> {
  databasePromise ??= openDatabase().catch((error: unknown) => {
    databasePromise = undefined;
    throw error;
  });

  return databasePromise;
}

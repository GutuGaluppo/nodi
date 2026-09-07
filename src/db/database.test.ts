import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.hoisted(() => ({
  execute: vi.fn(),
  load: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: sql.load },
}));

describe("initializeDatabase", () => {
  beforeEach(() => {
    vi.resetModules();
    sql.execute.mockReset().mockResolvedValue({ rowsAffected: 0 });
    sql.select.mockReset().mockResolvedValue([{ journal_mode: "wal" }]);
    sql.load.mockReset().mockResolvedValue({
      execute: sql.execute,
      select: sql.select,
    });
  });

  it("opens the application database and applies the required pragmas", async () => {
    const { initializeDatabase } = await import("./database");

    const firstConnection = await initializeDatabase();
    const secondConnection = await initializeDatabase();

    expect(sql.load).toHaveBeenCalledOnce();
    expect(sql.load).toHaveBeenCalledWith("sqlite:nodi.db");
    expect(sql.execute).toHaveBeenNthCalledWith(1, "PRAGMA foreign_keys = ON");
    expect(sql.select).toHaveBeenCalledWith("PRAGMA journal_mode = WAL");
    expect(sql.execute).toHaveBeenNthCalledWith(
      2,
      "PRAGMA busy_timeout = 5000",
    );
    expect(firstConnection).toBe(secondConnection);
  });

  it("surfaces a loading or migration failure and permits a later retry", async () => {
    sql.load.mockRejectedValueOnce(new Error("migration failed"));
    const { initializeDatabase } = await import("./database");
    const { DatabaseError } = await import("../lib/errors/DatabaseError");

    await expect(initializeDatabase()).rejects.toBeInstanceOf(DatabaseError);

    await expect(initializeDatabase()).resolves.toBeDefined();
    expect(sql.load).toHaveBeenCalledTimes(2);
  });
});

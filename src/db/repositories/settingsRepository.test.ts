import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({
  initializeDatabase: db.initializeDatabase,
}));

describe("settingsRepository", () => {
  beforeEach(() => {
    db.execute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    db.select.mockReset().mockResolvedValue([]);
    db.initializeDatabase
      .mockReset()
      .mockResolvedValue({ execute: db.execute, select: db.select });
  });

  it("reads a stored value with a parameterized query", async () => {
    db.select.mockResolvedValue([{ value: "device-42" }]);
    const { getSetting } = await import("./settingsRepository");

    await expect(getSetting("device_id")).resolves.toBe("device-42");
    expect(db.select).toHaveBeenCalledWith(
      "SELECT value FROM settings WHERE key = $1",
      ["device_id"],
    );
  });

  it("returns null when the key is absent", async () => {
    const { getSetting } = await import("./settingsRepository");

    await expect(getSetting("missing")).resolves.toBeNull();
  });

  it("upserts a value with a parameterized statement", async () => {
    const { setSetting } = await import("./settingsRepository");

    await setSetting("device_id", "device-42");

    expect(db.execute).toHaveBeenCalledWith(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ["device_id", "device-42"],
    );
  });

  it("wraps an underlying failure as a DatabaseError", async () => {
    db.select.mockRejectedValue(new Error("disk I/O error"));
    const { getSetting } = await import("./settingsRepository");
    const { DatabaseError } = await import("../../lib/errors/DatabaseError");

    await expect(getSetting("device_id")).rejects.toBeInstanceOf(DatabaseError);
  });
});

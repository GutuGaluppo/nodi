import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  select: vi.fn(),
  initializeDatabase: vi.fn(),
}));

vi.mock("../database", () => ({
  initializeDatabase: db.initializeDatabase,
}));

describe("storageRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    db.select.mockReset();
    db.initializeDatabase.mockReset().mockResolvedValue({ select: db.select });
  });

  it("reports size, integrity, and note counts from the live database", async () => {
    db.select
      .mockResolvedValueOnce([{ size_bytes: 409600 }])
      .mockResolvedValueOnce([
        {
          active_notes: 12,
          trashed_notes: 2,
          encrypted_private_notes: 3,
          pending_private_notes: 1,
        },
      ])
      .mockResolvedValueOnce([{ quick_check: "ok" }]);
    const { getStorageReport } = await import("./storageRepository");

    await expect(getStorageReport()).resolves.toEqual({
      sizeBytes: 409600,
      integrity: ["ok"],
      activeNotes: 12,
      trashedNotes: 2,
      encryptedPrivateNotes: 3,
      pendingPrivateNotes: 1,
    });
    expect(db.select.mock.calls[2][0]).toBe("PRAGMA quick_check");
    expect(db.select.mock.calls[1][0]).toContain("encrypted_payload IS NULL");
  });

  it("reports zero counts for an empty library", async () => {
    db.select
      .mockResolvedValueOnce([{ size_bytes: 8192 }])
      .mockResolvedValueOnce([
        {
          active_notes: null,
          trashed_notes: null,
          encrypted_private_notes: null,
          pending_private_notes: null,
        },
      ])
      .mockResolvedValueOnce([{ quick_check: "ok" }]);
    const { getStorageReport } = await import("./storageRepository");

    const report = await getStorageReport();

    expect(report.activeNotes).toBe(0);
    expect(report.pendingPrivateNotes).toBe(0);
  });

  it("passes on every problem the integrity check finds", async () => {
    db.select
      .mockResolvedValueOnce([{ size_bytes: 8192 }])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([
        { quick_check: "row 3 missing from index" },
        { quick_check: "page 7 is never used" },
      ]);
    const { getStorageReport } = await import("./storageRepository");

    await expect(getStorageReport()).resolves.toMatchObject({
      integrity: ["row 3 missing from index", "page 7 is never used"],
    });
  });

  it("wraps failures in a DatabaseError", async () => {
    db.select.mockRejectedValueOnce(new Error("disk I/O error"));
    const { getStorageReport } = await import("./storageRepository");
    const { DatabaseError } = await import("../../lib/errors/DatabaseError");

    await expect(getStorageReport()).rejects.toBeInstanceOf(DatabaseError);
  });
});

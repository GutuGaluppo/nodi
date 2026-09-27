import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listExportableNotes } from "../../db/repositories/exportRepository";
import { setSetting } from "../../db/repositories/settingsRepository";
import { setSpotlightEnabled, syncSpotlight } from "./spotlight";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../db/repositories/exportRepository", () => ({
  listExportableNotes: vi.fn(),
}));
vi.mock("../../db/repositories/settingsRepository", () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
}));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(setSetting).mockClear();
  vi.mocked(listExportableNotes).mockResolvedValue([
    {
      id: "n1",
      title: "Launch plan",
      contentJson: "{}",
      contentText: "Freeze the schema",
      notebook: "Product",
      tags: ["roadmap"],
      createdAt: "c",
      updatedAt: "u",
    },
  ]);
});

describe("spotlight", () => {
  it("indexes public notes with their tags and notebook as keywords", async () => {
    vi.mocked(invoke).mockResolvedValue(1);

    await expect(syncSpotlight()).resolves.toBe(1);

    expect(invoke).toHaveBeenCalledWith("spotlight_replace_notes", {
      notes: [
        {
          id: "n1",
          title: "Launch plan",
          text: "Freeze the schema",
          keywords: ["roadmap", "Product"],
        },
      ],
    });
    expect(setSetting).toHaveBeenCalledWith(
      "spotlight_last_run",
      expect.stringContaining('"indexed":1'),
    );
  });

  it("records a failed pass for the Your data page", async () => {
    vi.mocked(invoke).mockRejectedValue("Spotlight indexing is not available");

    await expect(syncSpotlight()).rejects.toBe(
      "Spotlight indexing is not available",
    );
    expect(setSetting).toHaveBeenCalledWith(
      "spotlight_last_run",
      expect.stringContaining("Spotlight indexing is not available"),
    );
  });

  it("clears every entry when turned off", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await setSpotlightEnabled(false);

    expect(setSetting).toHaveBeenCalledWith("spotlight_enabled", "false");
    expect(invoke).toHaveBeenCalledWith("spotlight_clear");
    expect(invoke).not.toHaveBeenCalledWith(
      "spotlight_replace_notes",
      expect.anything(),
    );
  });
});

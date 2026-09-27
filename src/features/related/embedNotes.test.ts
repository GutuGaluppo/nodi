import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listStaleNotes,
  saveEmbeddings,
} from "../../db/repositories/embeddingRepository";
import { embedStaleNotes } from "./embedNotes";
import { decodeVector } from "./similarity";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../db/repositories/embeddingRepository", () => ({
  listStaleNotes: vi.fn(),
  saveEmbeddings: vi.fn(),
}));

describe("embedStaleNotes", () => {
  beforeEach(() => {
    vi.mocked(listStaleNotes).mockReset();
    vi.mocked(saveEmbeddings).mockReset().mockResolvedValue();
  });

  it("embeds stale notes and stores their vectors with the note's version", async () => {
    vi.mocked(listStaleNotes).mockResolvedValueOnce([
      { id: "n1", text: "Launch plan", updatedAt: "u1" },
      { id: "n2", text: "Gruß aus Berlin", updatedAt: "u2" },
    ]);
    const embed = vi.fn().mockResolvedValue([
      { id: "n1", language: "en", vector: [0.5, -0.25] },
      { id: "n2", language: null, vector: [] },
    ]);

    await expect(embedStaleNotes(embed)).resolves.toBe(2);

    expect(embed).toHaveBeenCalledWith([
      { id: "n1", text: "Launch plan" },
      { id: "n2", text: "Gruß aus Berlin" },
    ]);
    const saved = vi.mocked(saveEmbeddings).mock.calls[0][0];
    expect(saved[0]).toMatchObject({
      noteId: "n1",
      language: "en",
      sourceUpdatedAt: "u1",
    });
    expect(Array.from(decodeVector(saved[0].vector))).toEqual([0.5, -0.25]);
    expect(saved[1]).toEqual({
      noteId: "n2",
      language: null,
      vector: "",
      sourceUpdatedAt: "u2",
    });
  });

  it("keeps going in batches until nothing is stale", async () => {
    const batch = Array.from({ length: 50 }, (_, i) => ({
      id: `n${i}`,
      text: "note",
      updatedAt: "u",
    }));
    vi.mocked(listStaleNotes)
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce(batch.slice(0, 3));
    const embed = vi.fn(async (inputs: { id: string }[]) =>
      inputs.map(({ id }) => ({ id, language: "en", vector: [1] })),
    );

    await expect(embedStaleNotes(embed)).resolves.toBe(53);
    expect(embed).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it } from "vitest";
import {
  decodeVector,
  encodeVector,
  findRelated,
  type NoteVector,
} from "./similarity";

function note(
  noteId: string,
  vector: number[],
  language: string | null = "en",
): NoteVector {
  return {
    noteId,
    title: noteId,
    language,
    vector: Float32Array.from(vector),
  };
}

describe("vector codec", () => {
  it("round-trips a vector through base64", () => {
    const vector = [0.25, -1.5, 3.75, 0];
    expect(Array.from(decodeVector(encodeVector(vector)))).toEqual(vector);
    expect(decodeVector("")).toHaveLength(0);
  });
});

describe("findRelated", () => {
  const vectors = [
    note("launch", [1, 0, 0]),
    note("roadmap", [0.9, 0.1, 0]),
    note("sync", [0.7, 0.7, 0]),
    note("groceries", [0, 0, 1]),
    note("lancamento", [1, 0, 0], "pt"),
    note("unknown", [], null),
  ];

  it("ranks notes by similarity, best first", () => {
    expect(
      findRelated("launch", vectors, 5, 0.5, 0.5).map((item) => item.noteId),
    ).toEqual(["roadmap", "sync"]);
  });

  it("drops notes far below the best match", () => {
    // roadmap scores 0.99 and sync 0.71: sync is more than 0.12 behind.
    expect(findRelated("launch", vectors).map((item) => item.noteId)).toEqual([
      "roadmap",
    ]);
  });

  it("never compares notes embedded in different languages", () => {
    expect(
      findRelated("launch", vectors).some(
        (item) => item.noteId === "lancamento",
      ),
    ).toBe(false);
    expect(findRelated("lancamento", vectors)).toEqual([]);
  });

  it("leaves out weak matches and respects the limit", () => {
    expect(
      findRelated("launch", vectors, 1).map((item) => item.noteId),
    ).toEqual(["roadmap"]);
    expect(
      findRelated("groceries", vectors).map((item) => item.noteId),
    ).toEqual([]);
  });

  it("returns nothing for a note without a vector", () => {
    expect(findRelated("unknown", vectors)).toEqual([]);
    expect(findRelated("missing", vectors)).toEqual([]);
  });

  it("ranks 5,000 notes within the 50 ms budget", () => {
    const many = Array.from({ length: 5_000 }, (_, i) =>
      note(
        `n${i}`,
        Array.from({ length: 512 }, (__, j) => Math.sin(i * 7 + j)),
      ),
    );
    const started = performance.now();
    findRelated("n0", many);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

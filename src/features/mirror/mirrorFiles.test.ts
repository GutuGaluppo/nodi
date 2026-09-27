import { describe, expect, it } from "vitest";
import type { ExportableNote } from "../../db/repositories/exportRepository";
import { buildMirrorFiles, toFileName } from "./mirrorFiles";

function note(overrides: Partial<ExportableNote>): ExportableNote {
  return {
    id: "n",
    title: "Note",
    contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
    contentText: "",
    notebook: null,
    tags: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("toFileName", () => {
  it.each([
    ["Launch plan — v1.0", "Launch plan — v1.0"],
    ["Q3/Q4: plan?", "Q3-Q4- plan-"],
    ["  ..hidden  ", "hidden"],
    ["trailing dots...", "trailing dots"],
    ["", "Untitled"],
    ["///", "---"],
  ])("%j → %j", (input, expected) => {
    expect(toFileName(input, "Untitled")).toBe(expected);
  });

  it("keeps names to a reasonable length", () => {
    expect(toFileName("a".repeat(300), "Untitled")).toHaveLength(120);
  });
});

describe("buildMirrorFiles", () => {
  it("files notes into notebook folders and keeps loose notes at the top", () => {
    const files = buildMirrorFiles([
      note({ id: "1", title: "Launch plan", notebook: "Product" }),
      note({ id: "2", title: "Groceries" }),
    ]);

    expect(files.map((file) => file.path)).toEqual([
      "Product/Launch plan.md",
      "Groceries.md",
    ]);
    expect(files[0].content).toContain('notebook: "Product"');
    expect(files[0].content).toContain("# Launch plan");
  });

  it("numbers colliding titles in creation order, ignoring case", () => {
    const files = buildMirrorFiles([
      note({ id: "1", title: "Ideas" }),
      note({ id: "2", title: "ideas" }),
      note({ id: "3", title: "Ideas" }),
      note({ id: "4", title: "" }),
    ]);

    expect(files.map((file) => file.path)).toEqual([
      "Ideas.md",
      "ideas (2).md",
      "Ideas (3).md",
      "Untitled.md",
    ]);
  });
});

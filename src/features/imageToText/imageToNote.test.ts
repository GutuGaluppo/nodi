import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAttachment } from "../../db/repositories/attachmentRepository";
import { saveAttachmentText } from "../../db/repositories/attachmentTextRepository";
import {
  createNote,
  type Note,
  permanentlyDeleteNote,
} from "../../db/repositories/noteRepository";
import {
  containsWord,
  createImageTextNote,
  imageNoteDocument,
  plainText,
  ReadTimeoutError,
  rankSuggestions,
  readImageText,
  replaceWord,
  textToContent,
  titleFromText,
} from "./imageToNote";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../db/repositories/attachmentRepository", () => ({
  createAttachment: vi.fn(),
}));
vi.mock("../../db/repositories/attachmentTextRepository", () => ({
  saveAttachmentText: vi.fn(),
}));
vi.mock("../../db/repositories/noteRepository", () => ({
  createNote: vi.fn(),
  permanentlyDeleteNote: vi.fn(),
}));

const image = {
  relativePath: "attachments/ab/abcdef/image.png",
  sha256: "abcdef",
  size: 1234,
  filename: "image.png",
  mimeType: "image/png",
};

const text = (value: string) => ({ type: "text", text: value });
const paragraph = (...rows: string[]) => ({
  type: "paragraph",
  content: rows.flatMap((row, index) =>
    index === 0 ? [text(row)] : [{ type: "hardBreak" }, text(row)],
  ),
});

describe("textToContent", () => {
  it("makes one paragraph per block, keeping its line breaks", () => {
    expect(textToContent("Linha 1\nLinha 2\n\n  Linha 3  \r\n")).toEqual([
      paragraph("Linha 1", "Linha 2"),
      paragraph("Linha 3"),
    ]);
  });

  it("turns marked rows into a bullet list; later rows continue the item", () => {
    expect(
      textToContent("Cadence\n- fechar app\ncom Quit\n• logo\n\nFim"),
    ).toEqual([
      paragraph("Cadence"),
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [paragraph("fechar app", "com Quit")],
          },
          { type: "listItem", content: [paragraph("logo")] },
        ],
      },
      paragraph("Fim"),
    ]);
  });

  it("keeps a minus sign that is not a marker", () => {
    expect(textToContent("-5 graus")).toEqual([paragraph("-5 graus")]);
  });
});

describe("plainText", () => {
  it("drops list markers and blank lines", () => {
    expect(plainText("Título\n\n- um\n- dois")).toBe("Título\num\ndois");
  });
});

describe("doubtful words", () => {
  const sample = "Logo barra de manus\nde menus.\nsomanus";

  it("ranks guesses written elsewhere in the text first", () => {
    expect(
      rankSuggestions(
        { word: "manus", suggestions: ["Manaus", "manos", "menus", "manus"] },
        sample,
      ),
    ).toEqual(["menus", "Manaus", "manos"]);
  });

  it("replaces whole words only, accents included", () => {
    expect(replaceWord(sample, "manus", "menus")).toBe(
      "Logo barra de menus\nde menus.\nsomanus",
    );
    expect(replaceWord("améis e améis.", "améis", "anéis")).toBe(
      "anéis e anéis.",
    );
  });

  it("knows when a word is gone after an edit", () => {
    expect(containsWord(sample, "manus")).toBe(true);
    expect(containsWord("somanus", "manus")).toBe(false);
    expect(containsWord("estiver", "estier")).toBe(false);
  });
});

describe("imageNoteDocument", () => {
  it("puts the source image after the text", () => {
    const doc = imageNoteDocument("Olá mundo", {
      path: image.relativePath,
      attachmentId: "att-1",
    });

    expect(doc.type).toBe("doc");
    expect(doc.content).toEqual([
      paragraph("Olá mundo"),
      {
        type: "image",
        attrs: { path: image.relativePath, attachmentId: "att-1", alt: "" },
      },
    ]);
  });

  it("is a valid empty document without text or image", () => {
    expect(imageNoteDocument("  \n ")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});

describe("titleFromText", () => {
  it("uses the first non-empty line", () => {
    expect(titleFromText("\n Lisbon Bakery \nPastel de nata")).toBe(
      "Lisbon Bakery",
    );
  });

  it("leaves out a list marker", () => {
    expect(titleFromText("- comprar pão")).toBe("comprar pão");
  });

  it("shortens long lines", () => {
    const title = titleFromText("a".repeat(200));
    expect(title).toHaveLength(80);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("readImageText", () => {
  it("tries once more after a timeout", async () => {
    vi.useFakeTimers();
    const read = vi
      .fn()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce({ text: "ok", doubtfulWords: [] });

    const pending = readImageText("attachments/x/y.png", read, 1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual({ text: "ok", doubtfulWords: [] });
    expect(read).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("gives up after the second timeout", async () => {
    vi.useFakeTimers();
    const read = vi.fn(() => new Promise<never>(() => {}));

    const pending = readImageText("attachments/x/y.png", read, 1_000);
    const outcome = expect(pending).rejects.toBeInstanceOf(ReadTimeoutError);
    await vi.advanceTimersByTimeAsync(2_000);

    await outcome;
    vi.useRealTimers();
  });

  it("does not retry other failures", async () => {
    const read = vi
      .fn()
      .mockRejectedValue(new Error("the image file is missing"));

    await expect(readImageText("attachments/x/y.png", read)).rejects.toThrow(
      "missing",
    );
    expect(read).toHaveBeenCalledOnce();
  });
});

describe("createImageTextNote", () => {
  const note = { id: "note-1" } as Note;

  beforeEach(() => {
    vi.mocked(createNote).mockReset().mockResolvedValue(note);
    vi.mocked(createAttachment)
      .mockReset()
      .mockImplementation(
        async (input) =>
          ({ ...input, id: input.id ?? "x", createdAt: "now" }) as never,
      );
    vi.mocked(saveAttachmentText).mockReset().mockResolvedValue();
    vi.mocked(permanentlyDeleteNote).mockReset().mockResolvedValue();
  });

  it("creates the note, links the image, and keeps the recognized text", async () => {
    await expect(
      createImageTextNote({
        image,
        text: "Recibo\nTotal 12.40",
        recognizedText: "Recib0\nTotal 12.40",
        notebookId: "nb-1",
      }),
    ).resolves.toBe(note);

    const input = vi.mocked(createNote).mock.calls[0][0];
    expect(input?.title).toBe("Recibo");
    expect(input?.contentText).toBe("Recibo\nTotal 12.40");
    expect(JSON.parse(input?.contentJson ?? "{}").content[0]).toEqual(
      paragraph("Recibo", "Total 12.40"),
    );
    expect(input?.notebookId).toBe("nb-1");

    const attachment = vi.mocked(createAttachment).mock.calls[0][0];
    expect(attachment).toMatchObject({
      noteId: "note-1",
      relativePath: image.relativePath,
      sha256: "abcdef",
      mimeType: "image/png",
    });
    const doc = JSON.parse(input?.contentJson ?? "{}");
    expect(doc.content.at(-1).attrs.attachmentId).toBe(attachment.id);
    expect(saveAttachmentText).toHaveBeenCalledWith(
      attachment.id,
      "Recib0\nTotal 12.40",
    );
  });

  it("removes the note when the image cannot be linked", async () => {
    vi.mocked(createAttachment).mockRejectedValue(new Error("disk full"));

    await expect(
      createImageTextNote({
        image,
        text: "Recibo",
        recognizedText: "Recibo",
        notebookId: null,
      }),
    ).rejects.toThrow("disk full");
    expect(permanentlyDeleteNote).toHaveBeenCalledWith("note-1");
    expect(saveAttachmentText).not.toHaveBeenCalled();
  });

  it("still returns the note when its search text cannot be kept", async () => {
    vi.mocked(saveAttachmentText).mockRejectedValue(new Error("busy"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      createImageTextNote({
        image,
        text: "Recibo",
        recognizedText: "Recibo",
        notebookId: null,
      }),
    ).resolves.toBe(note);
    consoleError.mockRestore();
  });
});

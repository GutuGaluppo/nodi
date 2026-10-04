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
  rankSuggestions,
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

  it("turns Handwriting OCR's Markdown into a heading and a list", () => {
    // Returned by Handwriting OCR for tests/fixtures/ocr-handwritten-list.jpg.
    const transcript =
      "# Image Reader\n\n* Use macOS Vision framework for OCR ✓  \n* Layout text by position (Left-to-right, top-to-bottom) ✓  \n* Flag doubtful words from spell checker  \n";
    expect(textToContent(transcript)).toEqual([
      { type: "heading", attrs: { level: 1 }, content: [text("Image Reader")] },
      {
        type: "bulletList",
        content: [
          "Use macOS Vision framework for OCR ✓",
          "Layout text by position (Left-to-right, top-to-bottom) ✓",
          "Flag doubtful words from spell checker",
        ].map((item) => ({ type: "listItem", content: [paragraph(item)] })),
      },
    ]);
  });

  it("ends a paragraph or list at a heading and keeps its level", () => {
    expect(textToContent("Intro\n## Lista ##\n- um\n###### Fim")).toEqual([
      paragraph("Intro"),
      { type: "heading", attrs: { level: 2 }, content: [text("Lista")] },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [paragraph("um")] }],
      },
      { type: "heading", attrs: { level: 6 }, content: [text("Fim")] },
    ]);
  });

  it("leaves hashes that are not headings as written", () => {
    expect(textToContent("#hashtag\n# \n####### sete\nC# e F#")).toEqual([
      paragraph("#hashtag", "#", "####### sete", "C# e F#"),
    ]);
    expect(textToContent("# Notas de C#")).toEqual([
      { type: "heading", attrs: { level: 1 }, content: [text("Notas de C#")] },
    ]);
  });

  it("marks bold and italic without changing the words", () => {
    expect(textToContent("Comprar **pão** e *leite* hoje")).toEqual([
      {
        type: "paragraph",
        content: [
          text("Comprar "),
          { type: "text", text: "pão", marks: [{ type: "bold" }] },
          text(" e "),
          { type: "text", text: "leite", marks: [{ type: "italic" }] },
          text(" hoje"),
        ],
      },
    ]);
    expect(textToContent("# **Recibo**")).toEqual([
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Recibo", marks: [{ type: "bold" }] }],
      },
    ]);
  });

  it("leaves asterisks that are not emphasis as written", () => {
    expect(textToContent("5 * 3 * 2\na*b*c\n** solto **\n*")).toEqual([
      paragraph("5 * 3 * 2", "a*b*c", "** solto **", "*"),
    ]);
  });
});

describe("plainText", () => {
  it("drops list markers and blank lines", () => {
    expect(plainText("Título\n\n- um\n- dois")).toBe("Título\num\ndois");
  });

  it("drops heading and emphasis markers but keeps other symbols", () => {
    expect(plainText("## Image Reader\n* **pão** e *leite*\n5 * 3")).toBe(
      "Image Reader\npão e leite\n5 * 3",
    );
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

  it("leaves out heading and emphasis markers", () => {
    expect(titleFromText("# **Image** Reader\n* item")).toBe("Image Reader");
  });

  it("shortens long lines", () => {
    const title = titleFromText("a".repeat(200));
    expect(title).toHaveLength(80);
    expect(title.endsWith("…")).toBe(true);
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

  it("keeps a PDF attachment outside canonical Tiptap text without rendering it as an image", async () => {
    await createImageTextNote({
      image: {
        ...image,
        mimeType: "application/pdf",
        relativePath: "attachments/ab/abcdef/document.pdf",
        filename: "document.pdf",
      },
      text: "PDF text",
      recognizedText: "PDF text",
      notebookId: null,
    });
    const content = JSON.parse(
      vi.mocked(createNote).mock.calls[0][0]?.contentJson ?? "{}",
    );
    expect(
      content.content.every((node: { type: string }) => node.type !== "image"),
    ).toBe(true);
    expect(createAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "application/pdf" }),
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

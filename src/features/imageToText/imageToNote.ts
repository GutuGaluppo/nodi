import { invoke } from "@tauri-apps/api/core";
import type { JSONContent } from "@tiptap/react";
import { createAttachment } from "../../db/repositories/attachmentRepository";
import { saveAttachmentText } from "../../db/repositories/attachmentTextRepository";
import {
  createNote,
  type Note,
  permanentlyDeleteNote,
} from "../../db/repositories/noteRepository";
import type { StoredAttachment } from "../../lib/attachments/storedAttachment";
import { createId } from "../../lib/ids/id";

/** A word the Mac's spell checker does not know, with its guesses. */
export interface DoubtfulWord {
  word: string;
  suggestions: string[];
}

/**
 * The text Vision read in an image: blocks separated by a blank line, list
 * items starting with `- `, and the words that were probably misread.
 */
export interface ImageText {
  text: string;
  doubtfulWords: DoubtfulWord[];
}

/** Reading an image normally takes a few seconds; this is the ceiling. */
export const READ_TIMEOUT_MS = 30_000;

const TITLE_MAX_LENGTH = 80;

export class ReadTimeoutError extends Error {
  constructor() {
    super("A leitura da imagem demorou mais de 30 segundos.");
    this.name = "ReadTimeoutError";
  }
}

export type ReadImage = (relativePath: string) => Promise<ImageText>;

/** Reads a stored image's text with Apple's Vision framework, on this Mac. */
export const readWithVision: ReadImage = (relativePath) =>
  invoke<ImageText>("read_image_text", { relativePath });

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReadTimeoutError()), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Reads an image's text, trying once more when the first read times out.
 * Other failures are reported at once.
 */
export async function readImageText(
  relativePath: string,
  read: ReadImage = readWithVision,
  timeoutMs = READ_TIMEOUT_MS,
): Promise<ImageText> {
  try {
    return await withTimeout(read(relativePath), timeoutMs);
  } catch (error) {
    if (!(error instanceof ReadTimeoutError)) throw error;
    return withTimeout(read(relativePath), timeoutMs);
  }
}

const LIST_ITEM = /^[-•*]\s+/;
const MAX_SUGGESTIONS = 4;

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function withBreaks(rows: string[]): JSONContent[] {
  return rows.flatMap((row, index) =>
    index === 0
      ? [{ type: "text", text: row }]
      : [{ type: "hardBreak" }, { type: "text", text: row }],
  );
}

/**
 * Tiptap content for the reviewed text. A blank line separates blocks; in a
 * block, rows starting with `- ` (or `•`, `*`) are bullet items, a row after
 * an item continues it, and other rows form a paragraph with line breaks.
 */
export function textToContent(text: string): JSONContent[] {
  const content: JSONContent[] = [];
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    let paragraph: string[] = [];
    let items: string[][] = [];
    const flushParagraph = () => {
      if (paragraph.length > 0) {
        content.push({ type: "paragraph", content: withBreaks(paragraph) });
      }
      paragraph = [];
    };
    const flushList = () => {
      if (items.length > 0) {
        content.push({
          type: "bulletList",
          content: items.map((rows) => ({
            type: "listItem",
            content: [{ type: "paragraph", content: withBreaks(rows) }],
          })),
        });
      }
      items = [];
    };
    for (const row of lines(block)) {
      if (LIST_ITEM.test(row)) {
        flushParagraph();
        const item = row.replace(LIST_ITEM, "");
        if (item !== "") items.push([item]);
      } else if (items.length > 0) {
        items[items.length - 1].push(row);
      } else {
        paragraph.push(row);
      }
    }
    flushParagraph();
    flushList();
  }
  return content;
}

/** The text without list markers, for previews and search. */
export function plainText(text: string): string {
  return lines(text)
    .map((line) => line.replace(LIST_ITEM, ""))
    .join("\n");
}

/**
 * The note body: the reviewed text, then the source image it came from.
 * With neither, a valid empty document.
 */
export function imageNoteDocument(
  text: string,
  image?: { path: string; attachmentId: string },
): JSONContent {
  const content = textToContent(text);
  if (image) {
    content.push({
      type: "image",
      attrs: { path: image.path, attachmentId: image.attachmentId, alt: "" },
    });
  }
  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

/** The first line of the text, shortened to fit a note title. */
export function titleFromText(text: string): string {
  const [first = ""] = lines(plainText(text));
  if (first.length <= TITLE_MAX_LENGTH) return first;
  return `${first.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches `word` as a whole word, letters with accents included. */
function wholeWord(word: string, flags = "gu"): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`,
    flags,
  );
}

/** Whether `word` still appears in the text, after the person's edits. */
export function containsWord(text: string, word: string): boolean {
  return wholeWord(word, "u").test(text);
}

/**
 * The spell checker's guesses, best first: a guess already written
 * elsewhere in the text ("menus" for "manus") comes before the others.
 */
export function rankSuggestions(
  doubtful: DoubtfulWord,
  text: string,
): string[] {
  const unique = [...new Set(doubtful.suggestions)].filter(
    (suggestion) => suggestion !== doubtful.word,
  );
  const inText = unique.filter((suggestion) =>
    wholeWord(suggestion, "iu").test(text),
  );
  const others = unique.filter((suggestion) => !inText.includes(suggestion));
  return [...inText, ...others].slice(0, MAX_SUGGESTIONS);
}

/** Replaces every whole-word occurrence of `word`. */
export function replaceWord(
  text: string,
  word: string,
  replacement: string,
): string {
  return text.replace(wholeWord(word), () => replacement);
}

export interface ImageTextNoteInput {
  image: StoredAttachment;
  /** The text as the person approved it. */
  text: string;
  /** What Vision read, kept so search finds the image's own words. */
  recognizedText: string;
  notebookId: string | null;
}

/**
 * Creates a note from a reviewed image (OCR-003): the approved text as
 * paragraphs, the image as an attachment of the note, and the recognized
 * text stored for search so the image is not read again. If the attachment
 * cannot be recorded, the half-made note is removed.
 */
export async function createImageTextNote(
  input: ImageTextNoteInput,
): Promise<Note> {
  const attachmentId = createId();
  const note = await createNote({
    title: titleFromText(input.text),
    contentJson: JSON.stringify(
      imageNoteDocument(input.text, {
        path: input.image.relativePath,
        attachmentId,
      }),
    ),
    contentText: plainText(input.text),
    notebookId: input.notebookId,
  });
  try {
    await createAttachment({
      id: attachmentId,
      noteId: note.id,
      filename: input.image.filename,
      mimeType: input.image.mimeType,
      relativePath: input.image.relativePath,
      sha256: input.image.sha256,
      size: input.image.size,
    });
  } catch (error) {
    await permanentlyDeleteNote(note.id).catch(() => undefined);
    throw error;
  }
  try {
    await saveAttachmentText(attachmentId, input.recognizedText);
  } catch (error) {
    // The note is complete; the background indexer reads the image later.
    console.error("NODI could not keep the image's text for search", error);
  }
  return note;
}

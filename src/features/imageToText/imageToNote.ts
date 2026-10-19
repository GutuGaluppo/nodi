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

const TITLE_MAX_LENGTH = 80;

const LIST_ITEM = /^[-•*]\s+/;
/** A Markdown heading, as Handwriting OCR returns it: `# Title`. */
const HEADING = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/;
/**
 * `**bold**`, or `*italic*` when the asterisks hug a word, so that
 * "5 * 3" and "a*b*c" stay as written.
 */
const EMPHASIS =
  /\*\*(?=\S)(.+?)(?<=\S)\*\*|(?<![\p{L}\p{N}*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\p{L}\p{N}*])/gu;
const MAX_SUGGESTIONS = 4;

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** Text nodes for a row, its emphasis as marks. Words are never changed. */
function inline(row: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  let last = 0;
  for (const match of row.matchAll(EMPHASIS)) {
    if (match.index > last)
      nodes.push({ type: "text", text: row.slice(last, match.index) });
    nodes.push({
      type: "text",
      text: match[1] ?? match[2],
      marks: [{ type: match[1] ? "bold" : "italic" }],
    });
    last = match.index + match[0].length;
  }
  if (last < row.length) nodes.push({ type: "text", text: row.slice(last) });
  return nodes;
}

function withBreaks(rows: string[]): JSONContent[] {
  return rows.flatMap((row, index) =>
    index === 0 ? inline(row) : [{ type: "hardBreak" }, ...inline(row)],
  );
}

/**
 * Tiptap content for the reviewed text. A blank line separates blocks; in a
 * block, rows starting with `#` are headings, rows starting with `- ` (or
 * `•`, `*`) are bullet items, a row after an item continues it, and other
 * rows form a paragraph with line breaks. `**bold**` and `*italic*` become
 * marks.
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
      const heading = HEADING.exec(row);
      if (heading) {
        flushParagraph();
        flushList();
        content.push({
          type: "heading",
          attrs: { level: heading[1].length },
          content: inline(heading[2]),
        });
      } else if (LIST_ITEM.test(row)) {
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

/** The text without list, heading or emphasis markers, for previews and search. */
export function plainText(text: string): string {
  return lines(text)
    .map((line) =>
      line
        .replace(HEADING, "$2")
        .replace(LIST_ITEM, "")
        .replace(EMPHASIS, (_, bold, italic) => bold ?? italic),
    )
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
  /** Provider text, kept without automatic word replacement. */
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
      imageNoteDocument(
        input.text,
        input.image.mimeType.startsWith("image/")
          ? {
              path: input.image.relativePath,
              attachmentId,
            }
          : undefined,
      ),
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
  } catch {
    // The note is complete; the background indexer reads the image later.
    console.error("NODI could not keep the attachment text for search");
  }
  return note;
}

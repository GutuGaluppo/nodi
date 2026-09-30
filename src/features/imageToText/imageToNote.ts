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

/** The text Vision read in an image, with its mean confidence from 0 to 1. */
export interface ImageText {
  text: string;
  confidence: number;
}

/** Below this, the review warns that the text probably needs fixing. */
export const LOW_CONFIDENCE = 0.5;

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

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** One paragraph per non-empty line of the reviewed text. */
export function textToParagraphs(text: string): JSONContent[] {
  return lines(text).map((line) => ({
    type: "paragraph",
    content: [{ type: "text", text: line }],
  }));
}

/**
 * The note body: the reviewed text, then the source image it came from.
 * With neither, a valid empty document.
 */
export function imageNoteDocument(
  text: string,
  image?: { path: string; attachmentId: string },
): JSONContent {
  const content = textToParagraphs(text);
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
  const [first = ""] = lines(text);
  if (first.length <= TITLE_MAX_LENGTH) return first;
  return `${first.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
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
    contentText: lines(input.text).join("\n"),
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

import { invoke } from "@tauri-apps/api/core";
import {
  listPendingImages,
  saveAttachmentText,
} from "../../db/repositories/attachmentTextRepository";

export type Recognize = (relativePath: string) => Promise<string>;

/** Reads an image's text with Apple's Vision framework, on this Mac. */
export const recognizeWithVision: Recognize = (relativePath) =>
  invoke<string>("recognize_attachment_text", { relativePath });

/**
 * Recognizes the text of every image still waiting, one at a time so the Mac
 * stays responsive. An image that cannot be read is stored with no text, so
 * it is not retried forever. Returns how many images were processed.
 */
export async function recognizePendingImages(
  recognize: Recognize = recognizeWithVision,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const pending = await listPendingImages();
  let done = 0;
  for (const image of pending) {
    let text = "";
    try {
      text = await recognize(image.relativePath);
    } catch (error) {
      console.error("NODI could not read the text in an image", error);
    }
    await saveAttachmentText(image.attachmentId, text);
    done += 1;
    onProgress?.(done, pending.length);
  }
  return done;
}

import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { Editor, JSONContent } from "@tiptap/react";
import { useCallback, useState } from "react";
import { createAttachment } from "../../db/repositories/attachmentRepository";
import type { Note } from "../../db/repositories/noteRepository";
import type {
  ImageImport,
  StoredAttachment,
} from "../../lib/attachments/storedAttachment";

export const imageTextKeys = { all: ["image-text"] as const };

const PRIVATE_NOTE_MESSAGE =
  "Images can't be added to private notes: image files are not encrypted.";

function describeRejected(rejected: ImageImport["rejected"]): string | null {
  if (rejected.length === 0) return null;
  const names = rejected.map((file) => file.name || "An item").join(", ");
  return `${names} could not be added: ${rejected[0].reason}.`;
}

/**
 * Inserts images into a note from the file picker, the clipboard, or files
 * dropped on the window (ATT-003). Each image is stored as an attachment on
 * the Mac and referenced by its path; nothing is uploaded.
 */
export function useImageInsertion(editor: Editor | null, note: Note | null) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const blocked = note?.isPrivate === true;

  const insert = useCallback(
    async (stored: StoredAttachment[], position?: number): Promise<void> => {
      if (editor === null || note === null || stored.length === 0) return;
      const nodes: JSONContent[] = [];
      for (const file of stored) {
        const attachment = await createAttachment({
          noteId: note.id,
          filename: file.filename,
          mimeType: file.mimeType,
          relativePath: file.relativePath,
          sha256: file.sha256,
          size: file.size,
        });
        nodes.push({
          type: "image",
          attrs: {
            path: attachment.relativePath,
            attachmentId: attachment.id,
            alt: "",
          },
        });
      }
      editor
        .chain()
        .focus()
        .insertContentAt(position ?? editor.state.selection.to, nodes)
        .run();
      await client.invalidateQueries({ queryKey: imageTextKeys.all });
    },
    [editor, note, client],
  );

  const run = useCallback(
    async (work: () => Promise<void>): Promise<void> => {
      if (blocked) {
        setMessage(PRIVATE_NOTE_MESSAGE);
        return;
      }
      setBusy(true);
      setMessage(null);
      try {
        await work();
      } catch (error) {
        setMessage(`The image could not be added: ${String(error)}.`);
      } finally {
        setBusy(false);
      }
    },
    [blocked],
  );

  const pick = useCallback(
    () =>
      run(async () => {
        const result = await invoke<ImageImport>("pick_image_files");
        await insert(result.stored);
        setMessage(describeRejected(result.rejected));
      }),
    [run, insert],
  );

  const paste = useCallback(
    (files: File[]) =>
      run(async () => {
        const stored: StoredAttachment[] = [];
        for (const file of files) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          stored.push(
            await invoke<StoredAttachment>("import_image_bytes", bytes),
          );
        }
        await insert(stored);
      }),
    [run, insert],
  );

  const drop = useCallback(
    (paths: string[], position?: number) =>
      run(async () => {
        const result = await invoke<ImageImport>("import_image_files", {
          paths,
        });
        await insert(result.stored, position);
        setMessage(describeRejected(result.rejected));
      }),
    [run, insert],
  );

  return {
    pick,
    paste,
    drop,
    busy,
    message,
    clearMessage: () => setMessage(null),
  };
}

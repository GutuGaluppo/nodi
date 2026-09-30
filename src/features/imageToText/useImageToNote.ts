import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import type {
  ImageImport,
  StoredAttachment,
} from "../../lib/attachments/storedAttachment";
import { imageTextKeys } from "../images/useImageInsertion";
import { notesKeys } from "../notes/useNotes";
import { searchKeys } from "../search/searchQueries";
import {
  createImageTextNote,
  type ImageText,
  type ReadImage,
  readImageText,
  readWithVision,
} from "./imageToNote";

export type ImageToNotePhase =
  | "choosing"
  | "reading"
  | "review"
  | "saving"
  | "error";

export interface ImageToNoteError {
  /** Where the flow stopped, so the dialog offers the right way back. */
  step: "choose" | "read" | "save";
  message: string;
}

export interface ImageToNoteState {
  phase: ImageToNotePhase;
  image: StoredAttachment | null;
  result: ImageText | null;
  error: ImageToNoteError | null;
}

const INITIAL: ImageToNoteState = {
  phase: "choosing",
  image: null,
  result: null,
  error: null,
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Options {
  notebookId: string | null;
  onCreated: (noteId: string) => void;
  read?: ReadImage;
}

/**
 * The image-to-note flow (OCR-003): choose or paste an image, read its text
 * on the Mac, review it, then create the note. Results that arrive after the
 * person moved on (cancelled, or chose another image) are ignored.
 */
export function useImageToNote({
  notebookId,
  onCreated,
  read = readWithVision,
}: Options) {
  const client = useQueryClient();
  const [state, setState] = useState<ImageToNoteState>(INITIAL);
  const generation = useRef(0);

  const readImage = useCallback(
    async (image: StoredAttachment): Promise<void> => {
      const current = ++generation.current;
      setState({ phase: "reading", image, result: null, error: null });
      try {
        const result = await readImageText(image.relativePath, read);
        if (current !== generation.current) return;
        setState({ phase: "review", image, result, error: null });
      } catch (error) {
        if (current !== generation.current) return;
        setState({
          phase: "error",
          image,
          result: null,
          error: {
            step: "read",
            message: `Não foi possível ler o texto da imagem: ${describe(error)}`,
          },
        });
      }
    },
    [read],
  );

  const failChoice = useCallback((message: string) => {
    generation.current += 1;
    setState({
      phase: "error",
      image: null,
      result: null,
      error: { step: "choose", message },
    });
  }, []);

  const choose = useCallback(async (): Promise<void> => {
    try {
      const picked = await invoke<ImageImport>("pick_image_files");
      const [image] = picked.stored;
      if (image) {
        await readImage(image);
      } else if (picked.rejected.length > 0) {
        const [rejected] = picked.rejected;
        failChoice(
          `${rejected.name || "A imagem"} não pôde ser usada: ${rejected.reason}.`,
        );
      }
    } catch (error) {
      failChoice(`Não foi possível abrir a imagem: ${describe(error)}`);
    }
  }, [readImage, failChoice]);

  const paste = useCallback(
    async (file: File): Promise<void> => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const image = await invoke<StoredAttachment>(
          "import_image_bytes",
          bytes,
        );
        await readImage(image);
      } catch (error) {
        failChoice(`A imagem colada não pôde ser usada: ${describe(error)}`);
      }
    },
    [readImage, failChoice],
  );

  const retry = useCallback((): void => {
    if (state.image) void readImage(state.image);
  }, [state.image, readImage]);

  const save = useCallback(
    async (text: string): Promise<void> => {
      const { image, result } = state;
      if (image === null || result === null) return;
      setState({ ...state, phase: "saving", error: null });
      try {
        const note = await createImageTextNote({
          image,
          text,
          recognizedText: result.text,
          notebookId,
        });
        await Promise.all(
          [notesKeys.all, imageTextKeys.all, searchKeys.all].map((queryKey) =>
            client.invalidateQueries({ queryKey }),
          ),
        );
        onCreated(note.id);
      } catch (error) {
        setState({
          ...state,
          phase: "error",
          error: {
            step: "save",
            message: `Não foi possível criar a nota: ${describe(error)}`,
          },
        });
      }
    },
    [state, notebookId, onCreated, client],
  );

  /** Back to review after a failed save, keeping the image and its text. */
  const backToReview = useCallback((): void => {
    setState((current) =>
      current.result ? { ...current, phase: "review", error: null } : current,
    );
  }, []);

  const reset = useCallback((): void => {
    generation.current += 1;
    setState(INITIAL);
  }, []);

  return { state, choose, paste, retry, save, backToReview, reset };
}

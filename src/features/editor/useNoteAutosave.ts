import { useCallback, useEffect, useRef, useState } from "react";

export interface NoteContentDraft {
  contentJson: string;
  contentText: string;
}

export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 450;

export function useNoteAutosave(
  noteId: string,
  onSave: (noteId: string, draft: NoteContentDraft) => Promise<void>,
) {
  const [status, setStatus] = useState<SaveStatus>("clean");
  const pending = useRef<NoteContentDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    clearTimer();
    const draft = pending.current;
    if (draft === null) {
      return;
    }

    pending.current = null;
    setStatus("saving");

    try {
      await saveRef.current(noteId, draft);
      setStatus(pending.current === null ? "saved" : "dirty");
    } catch {
      pending.current ??= draft;
      setStatus("error");
    }
  }, [clearTimer, noteId]);

  const queue = useCallback(
    (draft: NoteContentDraft): void => {
      pending.current = draft;
      setStatus("dirty");
      clearTimer();
      timer.current = setTimeout(() => {
        void flush();
      }, AUTOSAVE_DELAY_MS);
    },
    [clearTimer, flush],
  );

  useEffect(() => {
    function flushWhenHidden(): void {
      if (document.visibilityState === "hidden") {
        void flush();
      }
    }

    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);

    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [flush]);

  useEffect(
    () => () => {
      clearTimer();
      const draft = pending.current;
      if (draft !== null) {
        void saveRef.current(noteId, draft).catch(() => undefined);
      }
    },
    [clearTimer, noteId],
  );

  return { flush, queue, status };
}

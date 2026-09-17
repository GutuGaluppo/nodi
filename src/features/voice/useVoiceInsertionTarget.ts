import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef } from "react";

type Bookmark = ReturnType<Editor["utils"]["getUpdatedPosition"]>;

/**
 * Tracks a single cursor position across Tiptap transactions so a voice
 * result can be inserted where the user was when they started recording,
 * even if they kept typing meanwhile. Mirrors the standard ProseMirror
 * "bookmark a position, remap it on every transaction" technique, exposed
 * here through Tiptap's own `MappablePosition` helper.
 *
 * See docs/VOICE_TRANSCRIPTION_APPROACH.md section 2, decision #9.
 */
export function useVoiceInsertionTarget(editor: Editor | null) {
  const bookmarkRef = useRef<Bookmark | null>(null);

  useEffect(() => {
    bookmarkRef.current = null;
    if (editor === null) {
      return;
    }

    function handleTransaction({ transaction }: { transaction: Transaction }) {
      if (bookmarkRef.current === null) {
        return;
      }
      bookmarkRef.current =
        editor?.utils.getUpdatedPosition(
          bookmarkRef.current.position,
          transaction,
        ) ?? null;
    }

    editor.on("transaction", handleTransaction);
    return () => {
      editor.off("transaction", handleTransaction);
    };
  }, [editor]);

  /** Call when a recording starts, to remember where to insert its result. */
  const mark = useCallback(() => {
    if (editor === null) {
      return;
    }
    bookmarkRef.current = {
      position: editor.utils.createMappablePosition(
        editor.state.selection.from,
      ),
      mapResult: null,
    };
  }, [editor]);

  /**
   * The position to insert at right now: the bookmarked position if it's
   * still valid, otherwise the current cursor — never a stale, unmapped
   * position. Falling back to the cursor (rather than refusing to insert)
   * keeps the one-click "Inserir" flow working even when the document moved
   * on; see the approach doc's decision to pre-select "insert at current
   * cursor" instead of blocking on ambiguity.
   */
  const resolve = useCallback((): number => {
    if (editor === null) {
      return 0;
    }
    const bookmark = bookmarkRef.current;
    if (bookmark !== null && bookmark.mapResult?.deleted !== true) {
      const pos = bookmark.position.position;
      if (pos >= 0 && pos <= editor.state.doc.content.size) {
        return pos;
      }
    }
    return editor.state.selection.from;
  }, [editor]);

  return { mark, resolve };
}

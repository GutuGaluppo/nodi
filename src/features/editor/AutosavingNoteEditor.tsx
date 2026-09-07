import type { Note } from "../../db/repositories/noteRepository";
import NoteEditor from "../../editor/NoteEditor";
import { useUpdateNote } from "../notes/useUpdateNote";
import { useNoteAutosave } from "./useNoteAutosave";

interface AutosavingNoteEditorProps {
  note: Note;
  autoFocus?: boolean;
  onAutoFocus?: () => void;
}

const STATUS_LABELS = {
  clean: "",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Could not save",
} as const;

function AutosavingNoteEditor({
  note,
  autoFocus,
  onAutoFocus,
}: AutosavingNoteEditorProps) {
  const update = useUpdateNote();
  const autosave = useNoteAutosave(note.id, async (id, draft) => {
    await update.mutateAsync({ id, patch: draft });
  });

  return (
    <>
      <div className="save-status" role="status" aria-live="polite">
        {STATUS_LABELS[autosave.status]}
      </div>
      <NoteEditor
        note={note}
        autoFocus={autoFocus}
        onAutoFocus={onAutoFocus}
        onChange={autosave.queue}
        onBlur={() => {
          void autosave.flush();
        }}
      />
    </>
  );
}

export default AutosavingNoteEditor;

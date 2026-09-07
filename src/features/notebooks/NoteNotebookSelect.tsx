import type { Note } from "../../db/repositories/noteRepository";
import { useUpdateNote } from "../notes/useUpdateNote";
import { useNotebooks } from "./notebookQueries";

interface NoteNotebookSelectProps {
  note: Note;
  activeNotebookId: string | null;
  onMovedAway: () => void;
}

function NoteNotebookSelect({
  note,
  activeNotebookId,
  onMovedAway,
}: NoteNotebookSelectProps) {
  const notebooks = useNotebooks();
  const updateNote = useUpdateNote();

  return (
    <div className="note-notebook-control">
      <label htmlFor={`note-notebook-${note.id}`}>Notebook</label>
      <select
        id={`note-notebook-${note.id}`}
        value={note.notebookId ?? ""}
        disabled={notebooks.isPending || updateNote.isPending}
        onChange={(event) => {
          const notebookId = event.target.value || null;
          updateNote.mutate(
            { id: note.id, patch: { notebookId } },
            {
              onSuccess: () => {
                if (activeNotebookId && notebookId !== activeNotebookId) {
                  onMovedAway();
                }
              },
            },
          );
        }}
      >
        <option value="">No notebook</option>
        {notebooks.data?.map((notebook) => (
          <option key={notebook.id} value={notebook.id}>
            {notebook.name}
          </option>
        ))}
      </select>
      {updateNote.isError ? (
        <span className="inline-error" role="alert">
          Could not move note
        </span>
      ) : null}
    </div>
  );
}

export default NoteNotebookSelect;

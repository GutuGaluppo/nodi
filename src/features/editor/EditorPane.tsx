import { type Ref, useState } from "react";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import NoteNotebookSelect from "../notebooks/NoteNotebookSelect";
import { useNote } from "../notes/useNote";
import { usePermanentlyDeleteNote } from "../notes/usePermanentlyDeleteNote";
import { useRestoreNote } from "../notes/useRestoreNote";
import { useTrashNote } from "../notes/useTrashNote";
import AutosavingNoteEditor from "./AutosavingNoteEditor";
import NoteTitle from "./NoteTitle";

interface EditorPaneProps {
  noteId: string | null;
  ref?: Ref<HTMLElement>;
  focusEditor: boolean;
  onEditorFocused: () => void;
  view: "notes" | "trash";
  onNoteRemoved: () => void;
  activeNotebookId: string | null;
}

/**
 * The right column: loads the selected note's full body and hands it to the
 * Tiptap editor. The pane is programmatically focusable so note creation can
 * move focus here.
 */
function EditorPane({
  noteId,
  ref,
  focusEditor,
  onEditorFocused,
  view,
  onNoteRemoved,
  activeNotebookId,
}: EditorPaneProps) {
  const note = useNote(noteId);
  const trashNote = useTrashNote();
  const restoreNote = useRestoreNote();
  const deleteNote = usePermanentlyDeleteNote();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const selectedNote = note.data;

  return (
    <section
      ref={ref}
      className="editor-pane"
      aria-labelledby="editor-heading"
      tabIndex={-1}
    >
      {noteId === null ? (
        <div className="editor-empty-state">
          <p className="section-label">Editor</p>
          <h2 id="editor-heading">Nothing selected</h2>
          <p>Select a note to make this space yours.</p>
        </div>
      ) : note.isPending ? (
        <div className="editor-empty-state">
          <p className="section-label">Editor</p>
          <h2 id="editor-heading">Opening…</h2>
        </div>
      ) : note.isError || selectedNote == null ? (
        <div className="editor-empty-state" role="alert">
          <p className="section-label">Editor</p>
          <h2 id="editor-heading">This note could not be opened</h2>
          <p>Your data was not changed.</p>
        </div>
      ) : (
        <div className="editor-scroll">
          <h2 id="editor-heading" className="visually-hidden">
            {selectedNote.title.trim() === "" ? "Untitled" : selectedNote.title}
          </h2>
          <div className="editor-title-row">
            <NoteTitle key={selectedNote.id} note={selectedNote} />
            {view === "notes" ? (
              <button
                className="subtle-action danger-action"
                type="button"
                disabled={trashNote.isPending}
                onClick={() => {
                  trashNote.mutate(selectedNote.id, {
                    onSuccess: onNoteRemoved,
                  });
                }}
              >
                {trashNote.isPending ? "Moving…" : "Move to Trash"}
              </button>
            ) : (
              <div className="editor-note-actions">
                <button
                  className="subtle-action"
                  type="button"
                  disabled={restoreNote.isPending}
                  onClick={() => {
                    restoreNote.mutate(selectedNote.id, {
                      onSuccess: onNoteRemoved,
                    });
                  }}
                >
                  {restoreNote.isPending ? "Restoring…" : "Restore note"}
                </button>
                <button
                  className="subtle-action danger-action"
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete permanently
                </button>
              </div>
            )}
          </div>
          {view === "notes" ? (
            <NoteNotebookSelect
              note={selectedNote}
              activeNotebookId={activeNotebookId}
              onMovedAway={onNoteRemoved}
            />
          ) : null}
          {trashNote.isError || restoreNote.isError ? (
            <p className="inline-error" role="alert">
              This note could not be {view === "notes" ? "moved" : "restored"}.
              Your content was not changed.
            </p>
          ) : null}
          <AutosavingNoteEditor
            key={selectedNote.id}
            note={selectedNote}
            autoFocus={focusEditor}
            onAutoFocus={onEditorFocused}
          />
          {confirmingDelete ? (
            <ConfirmDialog
              title="Delete this note forever?"
              description="This permanently removes the note and its related data. This action cannot be undone."
              confirmLabel="Delete forever"
              isPending={deleteNote.isPending}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={() => {
                deleteNote.mutate(selectedNote.id, {
                  onSuccess: onNoteRemoved,
                });
              }}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

export default EditorPane;

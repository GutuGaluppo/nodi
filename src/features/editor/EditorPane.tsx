import type { Ref } from "react";
import { useNote } from "../notes/useNote";
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
}: EditorPaneProps) {
  const note = useNote(noteId);
  const trashNote = useTrashNote();
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
            ) : null}
          </div>
          {trashNote.isError ? (
            <p className="inline-error" role="alert">
              This note could not be moved. Your content was not changed.
            </p>
          ) : null}
          <AutosavingNoteEditor
            key={selectedNote.id}
            note={selectedNote}
            autoFocus={focusEditor}
            onAutoFocus={onEditorFocused}
          />
        </div>
      )}
    </section>
  );
}

export default EditorPane;

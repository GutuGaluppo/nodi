import type { Ref } from "react";
import NoteEditor from "../../editor/NoteEditor";
import { useNote } from "../notes/useNote";
import NoteTitle from "./NoteTitle";

interface EditorPaneProps {
  noteId: string | null;
  ref?: Ref<HTMLElement>;
  focusEditor: boolean;
  onEditorFocused: () => void;
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
}: EditorPaneProps) {
  const note = useNote(noteId);

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
      ) : note.isError || note.data == null ? (
        <div className="editor-empty-state" role="alert">
          <p className="section-label">Editor</p>
          <h2 id="editor-heading">This note could not be opened</h2>
          <p>Your data was not changed.</p>
        </div>
      ) : (
        <div className="editor-scroll">
          <h2 id="editor-heading" className="visually-hidden">
            {note.data.title.trim() === "" ? "Untitled" : note.data.title}
          </h2>
          <NoteTitle key={note.data.id} note={note.data} />
          <NoteEditor
            note={note.data}
            autoFocus={focusEditor}
            onAutoFocus={onEditorFocused}
          />
        </div>
      )}
    </section>
  );
}

export default EditorPane;

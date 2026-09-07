import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import type { Note } from "../db/repositories/noteRepository";
import { EMPTY_NOTE_CONTENT_JSON } from "../db/repositories/noteRepository";
import EditorToolbar from "./EditorToolbar";
import { editorExtensions } from "./editorExtensions";

function parseDocument(json: string): JSONContent {
  try {
    return JSON.parse(json) as JSONContent;
  } catch {
    return JSON.parse(EMPTY_NOTE_CONTENT_JSON) as JSONContent;
  }
}

interface NoteEditorProps {
  note: Note;
  autoFocus?: boolean;
  onAutoFocus?: () => void;
}

/**
 * The Tiptap editing surface for one note. Canonical content is Tiptap JSON
 * (`note.contentJson`). EDIT-001 renders and edits it in memory; autosave and
 * save-error recovery arrive with EDIT-003 and EDIT-004.
 */
function NoteEditor({ note, autoFocus = false, onAutoFocus }: NoteEditorProps) {
  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: parseDocument(note.contentJson),
      editorProps: {
        attributes: {
          class: "note-editor-surface",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": "Note body",
        },
      },
    },
    [],
  );

  // Reload the surface when a different note's body arrives. In EDIT-001 the
  // body only changes on note switch; EDIT-003 will guard against local echoes.
  useEffect(() => {
    editor.commands.setContent(parseDocument(note.contentJson));
  }, [editor, note.contentJson]);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    editor.commands.focus("end");
    onAutoFocus?.();
  }, [autoFocus, editor, onAutoFocus]);

  return (
    <div className="note-editor">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} className="note-editor-content" />
    </div>
  );
}

export default NoteEditor;

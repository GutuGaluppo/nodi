import type { Editor } from "@tiptap/react";
import { type Ref, useState } from "react";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Icon from "../../components/ui/Icon";
import NoteNotebookSelect from "../notebooks/NoteNotebookSelect";
import { useNote } from "../notes/useNote";
import { usePermanentlyDeleteNote } from "../notes/usePermanentlyDeleteNote";
import { useRestoreNote } from "../notes/useRestoreNote";
import { useTrashNote } from "../notes/useTrashNote";
import { useUpdateNote } from "../notes/useUpdateNote";
import PrivateNoteGate from "../privacy/PrivateNoteGate";
import ShortcutToggle from "../shortcuts/ShortcutToggle";
import NoteTagPicker from "../tags/NoteTagPicker";
import { useVoiceCapture } from "../voice/useVoiceCapture";
import { useVoiceInsertionTarget } from "../voice/useVoiceInsertionTarget";
import VoiceCaptureButton from "../voice/VoiceCaptureButton";
import VoiceCapturePanel from "../voice/VoiceCapturePanel";
import AutosavingNoteEditor from "./AutosavingNoteEditor";
import NoteTitle from "./NoteTitle";

const VOICE_LANGUAGES = [
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "en", label: "English" },
  { code: "auto", label: "Detectar automaticamente" },
] as const;

interface EditorPaneProps {
  noteId: string | null;
  ref?: Ref<HTMLElement>;
  focusEditor: boolean;
  onEditorFocused: () => void;
  view: "notes" | "trash";
  onNoteRemoved: () => void;
  activeNotebookId: string | null;
  activeTagId: string | null;
  libraryCollapsed: boolean;
  onExpandLibrary: () => void;
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
  activeTagId,
  libraryCollapsed,
  onExpandLibrary,
}: EditorPaneProps) {
  const note = useNote(noteId);
  const trashNote = useTrashNote();
  const restoreNote = useRestoreNote();
  const deleteNote = usePermanentlyDeleteNote();
  const updateNote = useUpdateNote();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [unlockedNoteId, setUnlockedNoteId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [voiceLanguage, setVoiceLanguage] = useState<string>("pt-BR");
  const selectedNote = note.data;

  const voice = useVoiceCapture();
  const insertionTarget = useVoiceInsertionTarget(editor);
  const canInsertVoiceResultHere =
    voice.state.result !== null &&
    selectedNote != null &&
    voice.state.result.noteId === selectedNote.id;

  function handleStartVoiceCapture(): void {
    if (selectedNote == null) {
      return;
    }
    insertionTarget.mark();
    void voice.start(selectedNote.id, voiceLanguage);
  }

  function handleInsertVoiceResult(): void {
    if (editor === null || voice.state.result === null) {
      return;
    }
    const pos = insertionTarget.resolve();
    editor.chain().focus().insertContentAt(pos, voice.state.result.text).run();
    voice.dismiss();
  }

  return (
    <section
      ref={ref}
      className="editor-pane"
      aria-labelledby="editor-heading"
      tabIndex={-1}
    >
      {libraryCollapsed ? (
        <button
          className="icon-button expand-library-button"
          type="button"
          aria-label="Expand Library"
          title="Expand Library"
          data-tooltip="Expand Library"
          onClick={onExpandLibrary}
        >
          <Icon name="chevron" />
        </button>
      ) : null}
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
      ) : selectedNote.isPrivate && unlockedNoteId !== selectedNote.id ? (
        <PrivateNoteGate
          onUnlocked={() => setUnlockedNoteId(selectedNote.id)}
        />
      ) : (
        <div className="editor-scroll">
          <h2 id="editor-heading" className="visually-hidden">
            {selectedNote.title.trim() === "" ? "Untitled" : selectedNote.title}
          </h2>
          <div className="editor-title-row">
            <NoteTitle key={selectedNote.id} note={selectedNote} />
            {view === "notes" ? (
              <div className="editor-note-actions">
                <ShortcutToggle
                  targetType="note"
                  targetId={selectedNote.id}
                  label={
                    selectedNote.title.trim() === ""
                      ? "Untitled"
                      : selectedNote.title
                  }
                />
                {voice.state.phase === "idle" ? (
                  <select
                    className="voice-language-select"
                    aria-label="Idioma da transcrição"
                    value={voiceLanguage}
                    onChange={(event) => setVoiceLanguage(event.target.value)}
                  >
                    {VOICE_LANGUAGES.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                ) : null}
                <VoiceCaptureButton
                  phase={voice.state.phase}
                  disabled={false}
                  onStart={handleStartVoiceCapture}
                  onStop={voice.stop}
                />
                <button
                  className="icon-action"
                  type="button"
                  aria-label={
                    selectedNote.isPrivate
                      ? "Make note public"
                      : "Make note private"
                  }
                  title={
                    selectedNote.isPrivate
                      ? "Make note public"
                      : "Make note private"
                  }
                  data-tooltip={
                    selectedNote.isPrivate
                      ? "Make note public"
                      : "Make note private"
                  }
                  disabled={updateNote.isPending}
                  onClick={() => {
                    updateNote.mutate({
                      id: selectedNote.id,
                      patch: { isPrivate: !selectedNote.isPrivate },
                    });
                  }}
                >
                  <Icon name="lock" />
                </button>
                <button
                  className="icon-action danger-action"
                  type="button"
                  aria-label="Move to Trash"
                  title="Move to Trash"
                  data-tooltip="Move to Trash"
                  disabled={trashNote.isPending}
                  onClick={() => {
                    trashNote.mutate(selectedNote.id, {
                      onSuccess: onNoteRemoved,
                    });
                  }}
                >
                  <Icon name="trash" />
                </button>
              </div>
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
            <div className="note-metadata-controls">
              <NoteNotebookSelect
                note={selectedNote}
                activeNotebookId={activeNotebookId}
                onMovedAway={onNoteRemoved}
              />
              <NoteTagPicker
                note={selectedNote}
                activeTagId={activeTagId}
                onRemovedFromActiveTag={onNoteRemoved}
              />
            </div>
          ) : null}
          {trashNote.isError || restoreNote.isError ? (
            <p className="inline-error" role="alert">
              This note could not be {view === "notes" ? "moved" : "restored"}.
              Your content was not changed.
            </p>
          ) : null}
          {view === "notes" ? (
            <VoiceCapturePanel
              voiceState={voice.state}
              canInsertHere={canInsertVoiceResultHere}
              onStop={voice.stop}
              onCancel={voice.cancel}
              onInsert={handleInsertVoiceResult}
              onDismiss={voice.dismiss}
            />
          ) : null}
          <AutosavingNoteEditor
            key={selectedNote.id}
            note={selectedNote}
            autoFocus={focusEditor}
            onAutoFocus={onEditorFocused}
            onEditorReady={setEditor}
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

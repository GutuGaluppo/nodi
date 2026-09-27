import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { Editor, JSONContent } from "@tiptap/react";
import { type Ref, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Icon from "../../components/ui/Icon";
import {
  countAttachments,
  createAttachment,
} from "../../db/repositories/attachmentRepository";
import type { VoiceSegment } from "../../editor/voiceRecording/VoiceRecordingNode";
import type { StoredAttachment } from "../../lib/attachments/storedAttachment";
import { useImageInsertion } from "../images/useImageInsertion";
import NoteNotebookSelect from "../notebooks/NoteNotebookSelect";
import { useNote } from "../notes/useNote";
import { usePermanentlyDeleteNote } from "../notes/usePermanentlyDeleteNote";
import { useRestoreNote } from "../notes/useRestoreNote";
import { useTrashNote } from "../notes/useTrashNote";
import { useUpdateNote } from "../notes/useUpdateNote";
import PrivateNoteGate from "../privacy/PrivateNoteGate";
import ReminderControl from "../reminders/ReminderControl";
import ShortcutToggle from "../shortcuts/ShortcutToggle";
import NoteTagPicker from "../tags/NoteTagPicker";
import { useVoiceActions } from "../voice/useVoiceActions";
import { useVoiceCapture } from "../voice/useVoiceCapture";
import { useVoiceInsertionTarget } from "../voice/useVoiceInsertionTarget";
import VoiceCaptureButton from "../voice/VoiceCaptureButton";
import VoiceCapturePanel from "../voice/VoiceCapturePanel";
import type { VoiceInsertionPlan } from "../voice/voiceCommandParser";
import {
  parseVoiceDictation,
  stripLeadingDirectives,
} from "../voice/voiceDirectives";
import AutosavingNoteEditor from "./AutosavingNoteEditor";
import NoteTitle from "./NoteTitle";

/** Turns a parsed voice command into the Tiptap content to insert. */
function buildVoiceInsertionContent(
  plan: VoiceInsertionPlan,
): JSONContent | string {
  if (plan.kind === "text") {
    return plan.text;
  }
  const isTask = plan.listType === "task";
  return {
    type: isTask ? "taskList" : "bulletList",
    content: plan.items.map((item) => ({
      type: isTask ? "taskItem" : "listItem",
      ...(isTask ? { attrs: { checked: false } } : {}),
      content: [{ type: "paragraph", content: [{ type: "text", text: item }] }],
    })),
  };
}

const KEEP_AUDIO_SETTING = "nodi.voice.keepAudio";

function readKeepAudio(): boolean {
  try {
    return window.localStorage.getItem(KEEP_AUDIO_SETTING) === "true";
  } catch {
    return false;
  }
}

function storeKeepAudio(value: boolean): void {
  try {
    window.localStorage.setItem(KEEP_AUDIO_SETTING, String(value));
  } catch {
    // The preference is a convenience; losing it changes nothing else.
  }
}

/** Throws away a staged recording the user did not keep. Best effort. */
function discardRecording(sessionId: string): void {
  void invoke("discard_voice_recording", { sessionId }).catch(() => undefined);
}

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
  const [confirmingPrivateFiles, setConfirmingPrivateFiles] = useState(0);
  const [unlockedNoteId, setUnlockedNoteId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [voiceLanguage, setVoiceLanguage] = useState<string>("pt-BR");
  const selectedNote = note.data;

  const images = useImageInsertion(editor, selectedNote ?? null);
  const dropImages = images.drop;

  // Files dropped on the window arrive as paths through Tauri, not as HTML
  // drop events. Only an open, editable note accepts them.
  useEffect(() => {
    if (editor === null || view !== "notes") return;
    let unlisten: (() => void) | undefined;
    let active = true;
    try {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type !== "drop" || event.payload.paths.length === 0)
            return;
          const scale = window.devicePixelRatio || 1;
          const at = editor.view.posAtCoords({
            left: event.payload.position.x / scale,
            top: event.payload.position.y / scale,
          });
          void dropImages(event.payload.paths, at?.pos);
        })
        .then((stop) => {
          if (active) unlisten = stop;
          else stop();
        })
        .catch(() => undefined);
    } catch {
      // Not running inside Tauri (for example in tests): nothing to listen to.
    }
    return () => {
      active = false;
      unlisten?.();
    };
  }, [editor, view, dropImages]);

  const voice = useVoiceCapture();
  const insertionTarget = useVoiceInsertionTarget(editor);
  const canInsertVoiceResultHere =
    voice.state.result !== null &&
    selectedNote != null &&
    voice.state.result.noteId === selectedNote.id;
  const dictation = useMemo(
    () =>
      voice.state.result === null
        ? null
        : parseVoiceDictation(voice.state.result.text),
    [voice.state.result],
  );
  const voiceActions = useVoiceActions(dictation?.organize ?? null);
  const [removedActionKeys, setRemovedActionKeys] = useState<string[]>([]);
  const [applyingVoice, setApplyingVoice] = useState(false);
  const [voiceApplyError, setVoiceApplyError] = useState(false);
  const [keepAudio, setKeepAudio] = useState(readKeepAudio);
  const [audioKeepError, setAudioKeepError] = useState(false);
  const canKeepAudio =
    voice.state.result?.audioAvailable === true &&
    selectedNote != null &&
    !selectedNote.isPrivate;
  const pendingVoiceActions = voiceActions.actions.filter(
    (action) => !removedActionKeys.includes(action.key),
  );

  // A new dictation starts with every spoken action selected again.
  useEffect(() => {
    if (voice.state.result !== null) {
      setRemovedActionKeys([]);
      setVoiceApplyError(false);
      setAudioKeepError(false);
    }
  }, [voice.state.result]);

  function handleStartVoiceCapture(): void {
    if (selectedNote == null) {
      return;
    }
    insertionTarget.mark();
    void voice.start(selectedNote.id, voiceLanguage);
  }

  async function handleInsertVoiceResult(): Promise<void> {
    if (editor === null || dictation === null || selectedNote == null) {
      return;
    }
    const { plan } = dictation;
    const result = voice.state.result;
    const pos = insertionTarget.resolve();
    const content: (JSONContent | string)[] = [];
    setApplyingVoice(true);

    let recording: JSONContent | null = null;
    if (result !== null && canKeepAudio && keepAudio) {
      try {
        const stored = await invoke<StoredAttachment>("keep_voice_recording", {
          sessionId: result.sessionId,
        });
        const attachment = await createAttachment({
          noteId: selectedNote.id,
          filename: stored.filename,
          mimeType: stored.mimeType,
          relativePath: stored.relativePath,
          sha256: stored.sha256,
          size: stored.size,
        });
        const segments: VoiceSegment[] = stripLeadingDirectives(
          result.segments.map((segment) => ({
            startMs: segment.startMs,
            endMs: segment.endMs,
            text: segment.text,
          })),
          dictation.organize,
        );
        recording = {
          type: "voiceRecording",
          attrs: {
            attachmentId: attachment.id,
            src: attachment.relativePath,
            durationMs: result.durationMs,
            segments,
          },
        };
      } catch {
        setAudioKeepError(true);
      }
    } else if (result?.audioAvailable) {
      discardRecording(result.sessionId);
    }

    // A kept recording carries the transcript itself; a list is still
    // inserted as a real list next to it.
    if (recording !== null) content.push(recording);
    if (
      plan.kind === "list" ||
      (recording === null && plan.text.trim() !== "")
    ) {
      content.push(buildVoiceInsertionContent(plan));
    }
    if (content.length > 0) {
      editor
        .chain()
        .focus()
        .insertContentAt(
          pos,
          content.length === 1 ? content[0] : (content as JSONContent[]),
        )
        .run();
    }
    try {
      await voiceActions.apply(selectedNote.id, pendingVoiceActions);
    } catch {
      setVoiceApplyError(true);
    } finally {
      setApplyingVoice(false);
      voice.dismiss();
    }
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
      ) : selectedNote.isPrivate &&
        (unlockedNoteId !== selectedNote.id || selectedNote.isLocked) ? (
        <PrivateNoteGate
          onUnlocked={async () => {
            // Wait for the decrypted note, so the editor never opens on the
            // empty locked copy and autosaves it over the real content.
            await note.refetch();
            setUnlockedNoteId(selectedNote.id);
          }}
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
                <button
                  className="icon-action"
                  type="button"
                  aria-label="Insert image"
                  title="Insert image"
                  data-tooltip="Insert image"
                  disabled={images.busy}
                  onClick={() => void images.pick()}
                >
                  <Icon name="image" />
                </button>
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
                  onClick={async () => {
                    if (!selectedNote.isPrivate) {
                      // Files are not encrypted; say so before going private.
                      const files = await countAttachments(
                        selectedNote.id,
                      ).catch(() => 0);
                      if (files > 0) {
                        setConfirmingPrivateFiles(files);
                        return;
                      }
                    }
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
              <ReminderControl noteId={selectedNote.id} />
            </div>
          ) : null}
          {images.message ? (
            <p className="inline-error" role="alert">
              {images.message}
            </p>
          ) : null}
          {audioKeepError ? (
            <p className="inline-error" role="alert">
              O áudio não pôde ser guardado. O texto ditado foi inserido sem a
              gravação.
            </p>
          ) : null}
          {voiceApplyError ? (
            <p className="inline-error" role="alert">
              O texto ditado foi inserido, mas o título, o caderno ou as tags
              não puderam ser aplicados. Ajuste-os manualmente.
            </p>
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
              onInsert={() => void handleInsertVoiceResult()}
              onDismiss={() => {
                if (voice.state.result?.audioAvailable) {
                  discardRecording(voice.state.result.sessionId);
                }
                voice.dismiss();
              }}
              keepAudio={
                canKeepAudio
                  ? {
                      checked: keepAudio,
                      onChange: (value) => {
                        setKeepAudio(value);
                        storeKeepAudio(value);
                      },
                    }
                  : undefined
              }
              audioUnavailableReason={
                voice.state.result?.audioAvailable && selectedNote.isPrivate
                  ? "O áudio não é guardado em notas privadas."
                  : undefined
              }
              plan={dictation?.plan}
              actions={pendingVoiceActions}
              onRemoveAction={(key) =>
                setRemovedActionKeys((keys) => [...keys, key])
              }
              isApplying={applyingVoice || !voiceActions.isReady}
            />
          ) : null}
          <AutosavingNoteEditor
            key={selectedNote.id}
            note={selectedNote}
            autoFocus={focusEditor}
            onAutoFocus={onEditorFocused}
            onEditorReady={setEditor}
            onPasteImages={(files) => void images.paste(files)}
          />
          {confirmingPrivateFiles > 0 ? (
            <ConfirmDialog
              title="Make this note private?"
              description={`The note's text will be encrypted, but its ${confirmingPrivateFiles === 1 ? "image or recording stays" : `${confirmingPrivateFiles} images and recordings stay`} unencrypted on this Mac. Text read from its images is deleted.`}
              confirmLabel="Make private"
              isPending={updateNote.isPending}
              onCancel={() => setConfirmingPrivateFiles(0)}
              onConfirm={() => {
                updateNote.mutate(
                  { id: selectedNote.id, patch: { isPrivate: true } },
                  { onSettled: () => setConfirmingPrivateFiles(0) },
                );
              }}
            />
          ) : null}
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

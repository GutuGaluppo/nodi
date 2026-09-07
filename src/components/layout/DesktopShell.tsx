import type { Ref } from "react";
import type { ThemePreference } from "../../app/theme";
import EditorPane from "../../features/editor/EditorPane";
import NoteList from "../../features/notes/NoteList";
import ThemeSelector from "../ui/ThemeSelector";

interface DesktopShellProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onOpenAbout: () => void;
  onCreateNote: () => void;
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  editorPaneRef: Ref<HTMLElement>;
  focusEditor: boolean;
  onEditorFocused: () => void;
}

function DesktopShell({
  theme,
  onThemeChange,
  onOpenAbout,
  onCreateNote,
  selectedNoteId,
  onSelectNote,
  editorPaneRef,
  focusEditor,
  onEditorFocused,
}: DesktopShellProps) {
  return (
    <main className="desktop-shell">
      <aside className="sidebar" aria-label="Sidebar">
        <header className="sidebar-header">
          <h1>NODI</h1>
          <p>Local notes</p>
        </header>

        <button
          className="new-note-button"
          type="button"
          onClick={onCreateNote}
        >
          <span aria-hidden="true">+</span> New note
        </button>

        <nav className="primary-navigation" aria-label="Primary navigation">
          <p className="section-label">Workspace</p>
          <button className="nav-item" type="button" aria-current="page">
            Notes
          </button>
        </nav>

        <footer className="sidebar-footer">
          <ThemeSelector value={theme} onChange={onThemeChange} />
          <button
            className="text-button sidebar-button"
            type="button"
            onClick={onOpenAbout}
          >
            About
          </button>
        </footer>
      </aside>

      <NoteList selectedNoteId={selectedNoteId} onSelectNote={onSelectNote} />

      <EditorPane
        ref={editorPaneRef}
        noteId={selectedNoteId}
        focusEditor={focusEditor}
        onEditorFocused={onEditorFocused}
      />
    </main>
  );
}

export default DesktopShell;

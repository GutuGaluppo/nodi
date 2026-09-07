import type { Ref } from "react";
import type { ThemePreference } from "../../app/theme";
import EditorPane from "../../features/editor/EditorPane";
import NotebookSection from "../../features/notebooks/NotebookSection";
import { useNotebooks } from "../../features/notebooks/notebookQueries";
import NoteList from "../../features/notes/NoteList";
import TagSection from "../../features/tags/TagSection";
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
  activeView: "notes" | "trash";
  onNavigate: (view: "notes" | "trash") => void;
  selectedNotebookId: string | null;
  onSelectNotebook: (id: string) => void;
  onNoteRemoved: () => void;
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
  activeView,
  onNavigate,
  selectedNotebookId,
  onSelectNotebook,
  onNoteRemoved,
}: DesktopShellProps) {
  const notebooks = useNotebooks();
  const selectedNotebookName = notebooks.data?.find(
    (notebook) => notebook.id === selectedNotebookId,
  )?.name;

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
          <button
            className="nav-item"
            type="button"
            aria-current={
              activeView === "notes" && selectedNotebookId === null
                ? "page"
                : undefined
            }
            onClick={() => onNavigate("notes")}
          >
            Notes
          </button>
          <button
            className="nav-item"
            type="button"
            aria-current={activeView === "trash" ? "page" : undefined}
            onClick={() => onNavigate("trash")}
          >
            Trash
          </button>
        </nav>

        <NotebookSection
          selectedNotebookId={selectedNotebookId}
          onSelectNotebook={onSelectNotebook}
        />

        <TagSection />

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

      <NoteList
        view={activeView}
        selectedNoteId={selectedNoteId}
        onSelectNote={onSelectNote}
        notebookId={activeView === "notes" ? selectedNotebookId : null}
        notebookName={selectedNotebookName}
      />

      <EditorPane
        ref={editorPaneRef}
        noteId={selectedNoteId}
        focusEditor={focusEditor}
        onEditorFocused={onEditorFocused}
        view={activeView}
        onNoteRemoved={onNoteRemoved}
        activeNotebookId={activeView === "notes" ? selectedNotebookId : null}
      />
    </main>
  );
}

export default DesktopShell;

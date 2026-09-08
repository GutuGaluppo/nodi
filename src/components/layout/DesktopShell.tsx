import { type Ref, useState } from "react";
import type { ThemePreference } from "../../app/theme";
import nodiMark from "../../assets/branding/nodi-mark.png";
import EditorPane from "../../features/editor/EditorPane";
import NotebookSection from "../../features/notebooks/NotebookSection";
import { useNotebooks } from "../../features/notebooks/notebookQueries";
import NoteList from "../../features/notes/NoteList";
import ShortcutSection from "../../features/shortcuts/ShortcutSection";
import TagSection from "../../features/tags/TagSection";
import { useTags } from "../../features/tags/tagQueries";
import Icon from "../ui/Icon";
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
  selectedTagId: string | null;
  onSelectTag: (id: string) => void;
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
  selectedTagId,
  onSelectTag,
  onNoteRemoved,
}: DesktopShellProps) {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const notebooks = useNotebooks();
  const selectedNotebookName = notebooks.data?.find(
    (notebook) => notebook.id === selectedNotebookId,
  )?.name;
  const tags = useTags();
  const selectedTagName = tags.data?.find(
    (tag) => tag.id === selectedTagId,
  )?.name;

  return (
    <main
      className={`desktop-shell${libraryCollapsed ? " library-collapsed" : ""}`}
    >
      <aside className="sidebar" aria-label="Sidebar">
        <header className="sidebar-app-header">
          <div className="sidebar-brand">
            <img src={nodiMark} alt="" />
            <h1>NODI</h1>
          </div>
          <details className="settings-menu">
            <summary
              aria-label="Settings"
              title="Settings"
              data-tooltip="Settings"
            >
              <Icon name="settings" />
            </summary>
            <div className="settings-popover">
              <button type="button" onClick={onOpenAbout}>
                About NODI
              </button>
            </div>
          </details>
        </header>

        <button
          className="new-note-button"
          type="button"
          onClick={onCreateNote}
        >
          <span aria-hidden="true">+</span> New note
        </button>

        <ShortcutSection
          onOpenNote={(id) => {
            onNavigate("notes");
            onSelectNote(id);
          }}
          onOpenNotebook={onSelectNotebook}
        />

        <nav className="primary-navigation" aria-label="Primary navigation">
          <p className="section-label">Workspace</p>
          <button
            className="nav-item"
            type="button"
            aria-current={
              activeView === "notes" &&
              selectedNotebookId === null &&
              selectedTagId === null
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

        <TagSection selectedTagId={selectedTagId} onSelectTag={onSelectTag} />

        <footer className="sidebar-footer">
          <ThemeSelector value={theme} onChange={onThemeChange} />
        </footer>
      </aside>

      {libraryCollapsed ? null : (
        <NoteList
          view={activeView}
          selectedNoteId={selectedNoteId}
          onSelectNote={onSelectNote}
          onCollapse={() => setLibraryCollapsed(true)}
          notebookId={activeView === "notes" ? selectedNotebookId : null}
          notebookName={selectedNotebookName}
          tagId={activeView === "notes" ? selectedTagId : null}
          tagName={selectedTagName}
        />
      )}

      <EditorPane
        ref={editorPaneRef}
        noteId={selectedNoteId}
        focusEditor={focusEditor}
        onEditorFocused={onEditorFocused}
        view={activeView}
        onNoteRemoved={onNoteRemoved}
        activeNotebookId={activeView === "notes" ? selectedNotebookId : null}
        activeTagId={activeView === "notes" ? selectedTagId : null}
        libraryCollapsed={libraryCollapsed}
        onExpandLibrary={() => setLibraryCollapsed(false)}
      />
    </main>
  );
}

export default DesktopShell;

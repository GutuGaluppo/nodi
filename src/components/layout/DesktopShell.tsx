import type { ThemePreference } from "../../app/theme";
import ThemeSelector from "../ui/ThemeSelector";

interface DesktopShellProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onOpenAbout: () => void;
}

function DesktopShell({
  theme,
  onThemeChange,
  onOpenAbout,
}: DesktopShellProps) {
  return (
    <main className="desktop-shell">
      <aside className="sidebar" aria-label="Sidebar">
        <header className="sidebar-header">
          <h1>NODI</h1>
          <p>Local notes</p>
        </header>

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

      <section className="note-list-pane" aria-labelledby="notes-heading">
        <header className="pane-header">
          <div>
            <p className="section-label">Library</p>
            <h2 id="notes-heading">Notes</h2>
          </div>
          <span className="item-count">
            <span aria-hidden="true">0</span>
            <span className="visually-hidden">0 notes</span>
          </span>
        </header>

        <div className="pane-empty-state">
          <p className="empty-state-title">No notes yet</p>
          <p>Your notes will appear here as the library takes shape.</p>
        </div>
      </section>

      <section className="editor-pane" aria-labelledby="editor-heading">
        <div className="editor-empty-state">
          <p className="section-label">Editor</p>
          <h2 id="editor-heading">Nothing selected</h2>
          <p>Select a note to make this space yours.</p>
        </div>
      </section>
    </main>
  );
}

export default DesktopShell;

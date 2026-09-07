import { useCallback, useEffect, useRef, useState } from "react";
import DesktopShell from "../components/layout/DesktopShell";
import About from "../features/about/About";
import { useCreateNote } from "../features/notes/useCreateNote";
import { AppProviders } from "./providers";
import { useGlobalShortcuts } from "./shortcuts";
import {
  applyThemePreference,
  getStoredThemePreference,
  storeThemePreference,
  type ThemePreference,
} from "./theme";

function Workspace({
  onOpenAbout,
  theme,
  onThemeChange,
}: {
  onOpenAbout: () => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}) {
  const [activeView, setActiveView] = useState<"notes" | "trash">("notes");
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(
    null,
  );
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editorFocusRequest, setEditorFocusRequest] = useState<string | null>(
    null,
  );
  const editorPaneRef = useRef<HTMLElement>(null);
  const { mutateAsync: createNote } = useCreateNote();

  const handleCreateNote = useCallback(async () => {
    const note = await createNote({ notebookId: selectedNotebookId });
    setSelectedNoteId(note.id);
    setEditorFocusRequest(note.id);
    editorPaneRef.current?.focus();
  }, [createNote, selectedNotebookId]);

  const handleSelectNote = useCallback((id: string) => {
    setEditorFocusRequest(null);
    setSelectedNoteId(id);
  }, []);

  const handleEditorFocused = useCallback(() => {
    setEditorFocusRequest(null);
  }, []);

  const handleNavigate = useCallback((view: "notes" | "trash") => {
    setActiveView(view);
    setSelectedNotebookId(null);
    setSelectedTagId(null);
    setSelectedNoteId(null);
    setEditorFocusRequest(null);
  }, []);

  useGlobalShortcuts([
    {
      id: "new-note",
      keys: ["mod", "n"],
      label: "New note",
      action: () => {
        void handleCreateNote();
      },
    },
  ]);

  return (
    <DesktopShell
      theme={theme}
      onThemeChange={onThemeChange}
      onOpenAbout={onOpenAbout}
      onCreateNote={() => {
        void handleCreateNote();
      }}
      selectedNoteId={selectedNoteId}
      onSelectNote={handleSelectNote}
      editorPaneRef={editorPaneRef}
      focusEditor={editorFocusRequest === selectedNoteId}
      onEditorFocused={handleEditorFocused}
      activeView={activeView}
      onNavigate={handleNavigate}
      selectedNotebookId={selectedNotebookId}
      onSelectNotebook={(id) => {
        setActiveView("notes");
        setSelectedNotebookId(id);
        setSelectedTagId(null);
        setSelectedNoteId(null);
        setEditorFocusRequest(null);
      }}
      selectedTagId={selectedTagId}
      onSelectTag={(id) => {
        setActiveView("notes");
        setSelectedNotebookId(null);
        setSelectedTagId(id);
        setSelectedNoteId(null);
        setEditorFocusRequest(null);
      }}
      onNoteRemoved={() => setSelectedNoteId(null)}
    />
  );
}

function App() {
  const [showAbout, setShowAbout] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(getStoredThemePreference);

  useEffect(() => {
    applyThemePreference(theme);
    storeThemePreference(theme);
  }, [theme]);

  return (
    <AppProviders>
      {showAbout ? (
        <About onClose={() => setShowAbout(false)} />
      ) : (
        <Workspace
          theme={theme}
          onThemeChange={setTheme}
          onOpenAbout={() => setShowAbout(true)}
        />
      )}
    </AppProviders>
  );
}

export default App;

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
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editorFocusRequest, setEditorFocusRequest] = useState<string | null>(
    null,
  );
  const editorPaneRef = useRef<HTMLElement>(null);
  const { mutateAsync: createNote } = useCreateNote();

  const handleCreateNote = useCallback(async () => {
    const note = await createNote(undefined);
    setSelectedNoteId(note.id);
    setEditorFocusRequest(note.id);
    editorPaneRef.current?.focus();
  }, [createNote]);

  const handleSelectNote = useCallback((id: string) => {
    setEditorFocusRequest(null);
    setSelectedNoteId(id);
  }, []);

  const handleEditorFocused = useCallback(() => {
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

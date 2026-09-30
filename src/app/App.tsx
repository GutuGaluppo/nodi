import { useCallback, useEffect, useRef, useState } from "react";
import DesktopShell from "../components/layout/DesktopShell";
import About from "../features/about/About";
import AttachmentSweeper from "../features/attachments/AttachmentSweeper";
import { captureToNote } from "../features/capture/captureNote";
import { useCaptureEvents } from "../features/capture/useCaptureEvents";
import ImageTextIndexer from "../features/images/ImageTextIndexer";
import ImageToTextDialog from "../features/imageToText/ImageToTextDialog";
import MirrorSync from "../features/mirror/MirrorSync";
import { useCreateNote } from "../features/notes/useCreateNote";
import YourData from "../features/privacy/YourData";
import RelatedNotesIndexer from "../features/related/RelatedNotesIndexer";
import ReminderScheduler from "../features/reminders/ReminderScheduler";
import SearchDialog from "../features/search/SearchDialog";
import SpotlightSync from "../features/spotlight/SpotlightSync";
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
  onOpenYourData,
  theme,
  onThemeChange,
}: {
  onOpenAbout: () => void;
  onOpenYourData: () => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}) {
  const [activeView, setActiveView] = useState<"notes" | "trash">("notes");
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(
    null,
  );
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState("");
  const [imageNoteOpen, setImageNoteOpen] = useState(false);
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

  useCaptureEvents({
    onQuickNote: () => {
      if (activeView === "trash") handleNavigate("notes");
      void handleCreateNote();
    },
    onOpenNote: (noteId) => {
      handleNavigate("notes");
      setSelectedNoteId(noteId);
    },
    onCapture: (capture) => {
      void createNote({ ...captureToNote(capture), notebookId: null }).then(
        (note) => {
          handleNavigate("notes");
          setSelectedNoteId(note.id);
        },
      );
    },
  });

  useGlobalShortcuts([
    {
      id: "new-note",
      keys: ["mod", "n"],
      label: "New note",
      action: () => {
        void handleCreateNote();
      },
    },
    {
      id: "search",
      keys: ["mod", "k"],
      label: "Search notes",
      action: () => {
        setSearchInitialQuery("");
        setSearchOpen(true);
      },
    },
    {
      id: "image-note",
      keys: ["mod", "shift", "p"],
      label: "Nota de imagem",
      action: () => setImageNoteOpen(true),
    },
  ]);

  return (
    <>
      <DesktopShell
        theme={theme}
        onThemeChange={onThemeChange}
        onOpenAbout={onOpenAbout}
        onOpenYourData={onOpenYourData}
        onCreateNote={() => {
          void handleCreateNote();
        }}
        onCreateImageNote={() => setImageNoteOpen(true)}
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
        onOpenSavedSearch={(query) => {
          setSearchInitialQuery(query);
          setSearchOpen(true);
        }}
      />
      {searchOpen ? (
        <SearchDialog
          onClose={() => setSearchOpen(false)}
          initialQuery={searchInitialQuery}
          onOpenNote={(id) => {
            setActiveView("notes");
            setSelectedNotebookId(null);
            setSelectedTagId(null);
            setSelectedNoteId(id);
            setSearchOpen(false);
          }}
        />
      ) : null}
      {imageNoteOpen ? (
        <ImageToTextDialog
          notebookId={activeView === "notes" ? selectedNotebookId : null}
          onClose={() => setImageNoteOpen(false)}
          onCreated={(noteId) => {
            setImageNoteOpen(false);
            if (activeView === "trash") handleNavigate("notes");
            setSelectedTagId(null);
            setSelectedNoteId(noteId);
          }}
        />
      ) : null}
    </>
  );
}

function App() {
  const [page, setPage] = useState<"workspace" | "about" | "data">("workspace");
  const [theme, setTheme] = useState<ThemePreference>(getStoredThemePreference);

  useEffect(() => {
    applyThemePreference(theme);
    storeThemePreference(theme);
  }, [theme]);

  return (
    <AppProviders>
      <ReminderScheduler />
      <AttachmentSweeper />
      <MirrorSync />
      <ImageTextIndexer />
      <RelatedNotesIndexer />
      <SpotlightSync />
      {page === "about" ? (
        <About onClose={() => setPage("workspace")} />
      ) : page === "data" ? (
        <YourData onClose={() => setPage("workspace")} />
      ) : (
        <Workspace
          theme={theme}
          onThemeChange={setTheme}
          onOpenAbout={() => setPage("about")}
          onOpenYourData={() => setPage("data")}
        />
      )}
    </AppProviders>
  );
}

export default App;

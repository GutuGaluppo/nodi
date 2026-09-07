import { type KeyboardEvent, useRef } from "react";
import NoteListItem from "./NoteListItem";
import { useNotes } from "./useNotes";

interface NoteListProps {
  view: "notes" | "trash";
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  notebookId?: string | null;
  notebookName?: string;
  tagId?: string | null;
  tagName?: string;
}

const MOVEMENT_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

function NoteList({
  view,
  selectedNoteId,
  onSelectNote,
  notebookId = null,
  notebookName,
  tagId = null,
  tagName,
}: NoteListProps) {
  const title =
    view === "trash"
      ? "Trash"
      : (notebookName ?? (notebookId ? "Notebook" : "Notes"));
  const displayTitle = tagName ? `# ${tagName}` : title;
  const notes = useNotes({
    deleted: view === "trash" ? "only" : "exclude",
    ...(view === "notes" && notebookId ? { notebookId } : {}),
    ...(view === "notes" && tagId ? { tagId } : {}),
  });
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  const data = notes.data ?? [];
  const count = data.length;
  const focusableId = selectedNoteId ?? data[0]?.id ?? null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!MOVEMENT_KEYS.has(event.key) || count === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = data.findIndex((note) => note.id === selectedNoteId);

    let nextIndex: number;
    switch (event.key) {
      case "ArrowDown":
        nextIndex =
          currentIndex < 0 ? 0 : Math.min(currentIndex + 1, count - 1);
        break;
      case "ArrowUp":
        nextIndex =
          currentIndex < 0 ? count - 1 : Math.max(currentIndex - 1, 0);
        break;
      case "Home":
        nextIndex = 0;
        break;
      default:
        nextIndex = count - 1;
        break;
    }

    const next = data[nextIndex];
    onSelectNote(next.id);
    itemRefs.current.get(next.id)?.focus();
  }

  return (
    <section className="note-list-pane" aria-labelledby="notes-heading">
      <header className="pane-header">
        <div>
          <p className="section-label">Library</p>
          <h2 id="notes-heading">{displayTitle}</h2>
        </div>
        <span className="item-count">
          <span aria-hidden="true">{count}</span>
          <span className="visually-hidden">
            {count} {view === "trash" ? "trashed notes" : "notes"}
          </span>
        </span>
      </header>

      {notes.isPending ? (
        <div className="pane-status" role="status">
          Loading {view === "trash" ? "Trash" : "your notes"}…
        </div>
      ) : notes.isError ? (
        <div className="pane-status" role="alert">
          <p>{displayTitle} could not be loaded. Your data was not changed.</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              void notes.refetch();
            }}
          >
            Try again
          </button>
        </div>
      ) : count === 0 ? (
        <div className="pane-empty-state">
          <p className="empty-state-title">
            {view === "trash" ? "Trash is empty" : "No notes yet"}
          </p>
          <p>
            {view === "trash"
              ? "Deleted notes will appear here."
              : notebookId || tagId
                ? "Notes moved to this notebook will appear here."
                : "Your notes will appear here as the library takes shape."}
          </p>
        </div>
      ) : (
        <div
          className="note-list"
          role="listbox"
          aria-label={displayTitle}
          onKeyDown={handleKeyDown}
        >
          {data.map((note) => (
            <NoteListItem
              key={note.id}
              note={note}
              isSelected={note.id === selectedNoteId}
              isTabbable={note.id === focusableId}
              onSelect={() => onSelectNote(note.id)}
              ref={(element) => {
                if (element) {
                  itemRefs.current.set(note.id, element);
                } else {
                  itemRefs.current.delete(note.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default NoteList;

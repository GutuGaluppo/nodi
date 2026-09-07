import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchNotes } from "./searchQueries";

interface SearchDialogProps {
  onClose: () => void;
  onOpenNote: (id: string) => void;
}

function SearchDialog({ onClose, onOpenNote }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useSearchNotes(query);
  const notes = results.data ?? [];

  useEffect(() => inputRef.current?.focus(), []);

  function openActive() {
    const note = notes[activeIndex];
    if (note) onOpenNote(note.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" && notes.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, notes.length - 1));
    } else if (event.key === "ArrowUp" && notes.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      openActive();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    openActive();
  }

  return (
    <div className="dialog-backdrop search-backdrop">
      <section
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-dialog-title"
      >
        <h2 className="visually-hidden" id="search-dialog-title">
          Search notes
        </h2>
        <form onSubmit={submit}>
          <label className="visually-hidden" htmlFor="global-search">
            Search notes
          </label>
          <input
            ref={inputRef}
            id="global-search"
            className="search-input"
            type="search"
            placeholder="Search notes…"
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <kbd>⌘ K</kbd>
        </form>

        <div className="search-results" aria-live="polite">
          {!query.trim() ? (
            <p className="search-hint">
              Search titles, writing, tags, and notebooks.
            </p>
          ) : results.isPending ? (
            <p className="search-hint">Searching…</p>
          ) : results.isError ? (
            <p className="search-hint" role="alert">
              Search could not be completed.
            </p>
          ) : notes.length === 0 ? (
            <p className="search-hint">No matching notes</p>
          ) : (
            <div
              className="search-result-list"
              role="listbox"
              aria-label="Search results"
            >
              {notes.map((note, index) => (
                <button
                  className="search-result"
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  key={note.id}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onOpenNote(note.id)}
                >
                  <strong>{note.title.trim() || "Untitled"}</strong>
                  <span>{note.contentText.trim() || "Empty note"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default SearchDialog;

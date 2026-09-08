import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useCreateSavedSearch } from "./savedSearchQueries";
import { parseSearchInput } from "./searchParser";
import { useSearchNotes } from "./searchQueries";

interface SearchDialogProps {
  onClose: () => void;
  onOpenNote: (id: string) => void;
  initialQuery?: string;
}

function SearchDialog({
  onClose,
  onOpenNote,
  initialQuery = "",
}: SearchDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const [namingSearch, setNamingSearch] = useState(false);
  const [searchName, setSearchName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const results = useSearchNotes(query);
  const saveSearch = useCreateSavedSearch();
  const notes = results.data ?? [];
  const parsed = parseSearchInput(query);
  const activeFilters = Object.entries(parsed.filters);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    if (namingSearch) nameInputRef.current?.focus();
  }, [namingSearch]);

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

  async function submitSavedSearch(event: FormEvent) {
    event.preventDefault();
    if (!searchName.trim() || !query.trim()) return;
    try {
      await saveSearch.mutateAsync({ name: searchName, query });
      setNamingSearch(false);
      setSearchName("");
      inputRef.current?.focus();
    } catch {
      // Mutation state renders the recoverable error without closing the form.
    }
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
        <form className="search-query-form" onSubmit={submit}>
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
          <button
            className="search-save-button"
            type="button"
            disabled={!query.trim() || saveSearch.isPending}
            onClick={() => setNamingSearch(true)}
          >
            Save search
          </button>
          <kbd>⌘ K</kbd>
        </form>

        {namingSearch ? (
          <form className="save-search-form" onSubmit={submitSavedSearch}>
            <label htmlFor="saved-search-name">Saved search name</label>
            <input
              ref={nameInputRef}
              id="saved-search-name"
              value={searchName}
              onChange={(event) => setSearchName(event.target.value)}
              placeholder="e.g. Recent project notes"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!searchName.trim() || saveSearch.isPending}
            >
              {saveSearch.isPending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setNamingSearch(false)}>
              Cancel
            </button>
            {saveSearch.isError ? (
              <p role="alert">Search could not be saved.</p>
            ) : null}
          </form>
        ) : null}

        {activeFilters.length > 0 ? (
          <ul className="search-filter-list" aria-label="Active search filters">
            {activeFilters.map(([key, value]) => (
              <li key={key}>
                {key}: {value}
              </li>
            ))}
          </ul>
        ) : null}

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

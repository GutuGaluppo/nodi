import type { Ref } from "react";
import type { NoteSummary } from "../../db/repositories/noteRepository";
import { formatRelativeTime } from "../../lib/dates/relativeTime";

interface NoteListItemProps {
  note: NoteSummary;
  isSelected: boolean;
  isTabbable: boolean;
  onSelect: () => void;
  ref?: Ref<HTMLDivElement>;
}

/** One row in the note list. Presentation only; list semantics live in NoteList. */
function NoteListItem({
  note,
  isSelected,
  isTabbable,
  onSelect,
  ref,
}: NoteListItemProps) {
  const title = note.title.trim() === "" ? "Untitled" : note.title;
  const preview = note.contentText.trim();

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isSelected}
      tabIndex={isTabbable ? 0 : -1}
      className="note-list-item"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="note-list-item-title">{title}</span>
      {preview === "" ? null : (
        <span className="note-list-item-preview">{preview}</span>
      )}
      <span className="note-list-item-meta">
        <time dateTime={note.updatedAt}>
          {formatRelativeTime(note.updatedAt)}
        </time>
        {note.notebookId === null ? null : (
          <span className="note-list-item-notebook" aria-hidden="true">
            •
          </span>
        )}
      </span>
    </div>
  );
}

export default NoteListItem;

import { type KeyboardEvent, useEffect, useState } from "react";
import type { Note } from "../../db/repositories/noteRepository";
import { useUpdateNote } from "../notes/useUpdateNote";

interface NoteTitleProps {
  note: Note;
}

function NoteTitle({ note }: NoteTitleProps) {
  const [title, setTitle] = useState(note.title);
  const update = useUpdateNote();

  useEffect(() => {
    setTitle(note.title);
  }, [note.title]);

  function persistTitle(): void {
    if (title === note.title) {
      return;
    }

    update.mutate({ id: note.id, patch: { title } });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  return (
    <div className="note-title-field">
      <label className="visually-hidden" htmlFor="note-title">
        Note title
      </label>
      <input
        id="note-title"
        value={title}
        placeholder="Untitled"
        aria-describedby={update.isError ? "note-title-error" : undefined}
        onChange={(event) => setTitle(event.currentTarget.value)}
        onBlur={persistTitle}
        onKeyDown={handleKeyDown}
      />
      {update.isError ? (
        <p id="note-title-error" className="inline-error" role="alert">
          The title could not be saved. Your text is still here.
        </p>
      ) : null}
    </div>
  );
}

export default NoteTitle;

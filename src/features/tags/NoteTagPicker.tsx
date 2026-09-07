import type { Note } from "../../db/repositories/noteRepository";
import {
  useAddTagToNote,
  useNoteTags,
  useRemoveTagFromNote,
} from "./noteTagQueries";
import { useTags } from "./tagQueries";

interface NoteTagPickerProps {
  note: Note;
  activeTagId: string | null;
  onRemovedFromActiveTag: () => void;
}

function NoteTagPicker({
  note,
  activeTagId,
  onRemovedFromActiveTag,
}: NoteTagPickerProps) {
  const tags = useTags();
  const assigned = useNoteTags(note.id);
  const addTag = useAddTagToNote();
  const removeTag = useRemoveTagFromNote();
  const assignedIds = new Set(assigned.data?.map((tag) => tag.id));
  const available = tags.data?.filter((tag) => !assignedIds.has(tag.id)) ?? [];

  return (
    <div className="note-tags-control">
      <span className="note-tags-label">Tags</span>
      <ul className="note-tag-list" aria-label="Tags on this note">
        {assigned.data?.map((tag) => (
          <li className="note-tag" key={tag.id}>
            # {tag.name}
            <button
              type="button"
              aria-label={`Remove tag ${tag.name}`}
              disabled={removeTag.isPending}
              onClick={() =>
                removeTag.mutate(
                  { noteId: note.id, tagId: tag.id },
                  {
                    onSuccess: () => {
                      if (activeTagId === tag.id) onRemovedFromActiveTag();
                    },
                  },
                )
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {available.length > 0 ? (
        <select
          aria-label="Add tag"
          value=""
          disabled={addTag.isPending}
          onChange={(event) => {
            if (!event.target.value) return;
            addTag.mutate({ noteId: note.id, tagId: event.target.value });
          }}
        >
          <option value="">Add tag…</option>
          {available.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      ) : null}
      {assigned.isError || addTag.isError || removeTag.isError ? (
        <span className="inline-error" role="alert">
          Could not update tags
        </span>
      ) : null}
    </div>
  );
}

export default NoteTagPicker;

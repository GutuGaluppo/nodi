import { type FormEvent, useState } from "react";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import type { Tag } from "../../db/repositories/tagRepository";
import {
  useCreateTag,
  useDeleteTag,
  useRenameTag,
  useTags,
} from "./tagQueries";

interface TagSectionProps {
  selectedTagId: string | null;
  onSelectTag: (id: string) => void;
}

function TagSection({ selectedTagId, onSelectTag }: TagSectionProps) {
  const tags = useTags();
  const createTag = useCreateTag();
  const renameTag = useRenameTag();
  const deleteTag = useDeleteTag();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renaming, setRenaming] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);

  function reset() {
    setEditing(false);
    setDraftName("");
    setRenaming(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    if (renaming) {
      renameTag.mutate({ id: renaming.id, name }, { onSuccess: reset });
    } else {
      createTag.mutate(name, { onSuccess: reset });
    }
  }

  const error =
    tags.error ?? createTag.error ?? renameTag.error ?? deleteTag.error;
  const data = tags.data ?? [];

  return (
    <section className="tag-section" aria-labelledby="tags-label">
      <header className="sidebar-section-header">
        <p className="section-label sidebar-section-label" id="tags-label">
          Tags
        </p>
        <button
          className="sidebar-icon-button"
          type="button"
          aria-label="Create tag"
          onClick={() => {
            reset();
            setEditing(true);
          }}
        >
          +
        </button>
      </header>

      {editing ? (
        <form className="notebook-form" onSubmit={submit}>
          <input
            aria-label={renaming ? "Tag name" : "New tag name"}
            value={draftName}
            placeholder="Tag name"
            ref={(element) => element?.focus()}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") reset();
            }}
          />
          <div className="notebook-form-actions">
            <button className="small-action" type="submit">
              Save
            </button>
            <button className="small-action" type="button" onClick={reset}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {tags.isPending ? (
        <p className="sidebar-status">Loading…</p>
      ) : data.length === 0 && !editing ? (
        <p className="sidebar-status">No tags yet</p>
      ) : (
        <ul className="tag-list">
          {data.map((tag) => (
            <li key={tag.id}>
              <button
                className="tag-name"
                type="button"
                aria-current={selectedTagId === tag.id ? "page" : undefined}
                onClick={() => onSelectTag(tag.id)}
              >
                # {tag.name}
              </button>
              <span className="tag-row-actions">
                <button
                  type="button"
                  aria-label={`Rename tag ${tag.name}`}
                  onClick={() => {
                    reset();
                    setEditing(true);
                    setDraftName(tag.name);
                    setRenaming(tag);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Delete tag ${tag.name}`}
                  onClick={() => setDeleting(tag)}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="sidebar-error" role="alert">
          {error.message}
        </p>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete tag “${deleting.name}”?`}
          description="The tag will be removed from every note. Notes and their content will remain intact."
          confirmLabel="Delete tag"
          isPending={deleteTag.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            deleteTag.mutate(deleting.id, {
              onSuccess: () => setDeleting(null),
            })
          }
        />
      ) : null}
    </section>
  );
}

export default TagSection;

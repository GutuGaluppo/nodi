import { type FormEvent, useState } from "react";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import type { Notebook } from "../../db/repositories/notebookRepository";
import {
  useCreateNotebook,
  useDeleteNotebook,
  useNotebooks,
  useRenameNotebook,
} from "./notebookQueries";

interface NotebookSectionProps {
  selectedNotebookId: string | null;
  onSelectNotebook: (id: string) => void;
}

function NotebookSection({
  selectedNotebookId,
  onSelectNotebook,
}: NotebookSectionProps) {
  const notebooks = useNotebooks();
  const createNotebook = useCreateNotebook();
  const renameNotebook = useRenameNotebook();
  const deleteNotebook = useDeleteNotebook();
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renaming, setRenaming] = useState<Notebook | null>(null);
  const [deleting, setDeleting] = useState<Notebook | null>(null);

  function resetEditor() {
    setCreating(false);
    setRenaming(null);
    setDraftName("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) return;

    if (renaming) {
      renameNotebook.mutate(
        { id: renaming.id, name },
        { onSuccess: resetEditor },
      );
      return;
    }
    createNotebook.mutate(name, { onSuccess: resetEditor });
  }

  const error =
    notebooks.error ??
    createNotebook.error ??
    renameNotebook.error ??
    deleteNotebook.error;

  return (
    <section className="notebook-section" aria-labelledby="notebooks-label">
      <header className="sidebar-section-header">
        <p className="section-label sidebar-section-label" id="notebooks-label">
          Notebooks
        </p>
        <button
          className="sidebar-icon-button"
          type="button"
          aria-label="Create notebook"
          onClick={() => {
            setRenaming(null);
            setDraftName("");
            setCreating(true);
          }}
        >
          +
        </button>
      </header>

      {creating || renaming ? (
        <form className="notebook-form" onSubmit={submit}>
          <input
            aria-label={renaming ? "Notebook name" : "New notebook name"}
            value={draftName}
            placeholder="Notebook name"
            ref={(element) => element?.focus()}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") resetEditor();
            }}
          />
          <div className="notebook-form-actions">
            <button className="small-action" type="submit">
              Save
            </button>
            <button
              className="small-action"
              type="button"
              onClick={resetEditor}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {notebooks.isPending ? (
        <p className="sidebar-status">Loading…</p>
      ) : notebooks.isError ? (
        <button
          className="sidebar-status"
          type="button"
          onClick={() => void notebooks.refetch()}
        >
          Try loading notebooks again
        </button>
      ) : notebooks.data.length === 0 && !creating ? (
        <p className="sidebar-status">No notebooks yet</p>
      ) : (
        <ul className="notebook-list">
          {notebooks.data.map((notebook) => (
            <li key={notebook.id}>
              <button
                className="notebook-link"
                type="button"
                title={notebook.name}
                aria-current={
                  selectedNotebookId === notebook.id ? "page" : undefined
                }
                onClick={() => onSelectNotebook(notebook.id)}
              >
                {notebook.name}
              </button>
              <span className="notebook-row-actions">
                <button
                  type="button"
                  aria-label={`Rename ${notebook.name}`}
                  onClick={() => {
                    setCreating(false);
                    setDraftName(notebook.name);
                    setRenaming(notebook);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${notebook.name}`}
                  onClick={() => setDeleting(notebook)}
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
          title={`Delete “${deleting.name}”?`}
          description="The notebook must be empty before it can be deleted. This action cannot be undone."
          confirmLabel="Delete notebook"
          isPending={deleteNotebook.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            deleteNotebook.mutate(deleting.id, {
              onSuccess: () => setDeleting(null),
            });
          }}
        />
      ) : null}
    </section>
  );
}

export default NotebookSection;

import { type FormEvent, useState } from "react";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import type { Notebook } from "../../db/repositories/notebookRepository";
import type { NotebookStack } from "../../db/repositories/notebookStackRepository";
import {
  useCreateNotebook,
  useDeleteNotebook,
  useNotebooks,
  useRenameNotebook,
} from "./notebookQueries";
import {
  useCreateNotebookStack,
  useDeleteNotebookStack,
  useMoveNotebookToStack,
  useNotebookStacks,
  useRenameNotebookStack,
} from "./notebookStackQueries";

interface NotebookSectionProps {
  selectedNotebookId: string | null;
  onSelectNotebook: (id: string) => void;
}

interface NotebookRowsProps extends NotebookSectionProps {
  notebooks: Notebook[];
  stacks: NotebookStack[];
  onRename: (notebook: Notebook) => void;
  onDelete: (notebook: Notebook) => void;
  onMove: (notebookId: string, stackId: string | null) => void;
}

function NotebookRows({
  notebooks,
  stacks,
  selectedNotebookId,
  onSelectNotebook,
  onRename,
  onDelete,
  onMove,
}: NotebookRowsProps) {
  if (notebooks.length === 0) return null;

  return (
    <ul className="notebook-list">
      {notebooks.map((notebook) => (
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
            <select
              aria-label={`Stack for ${notebook.name}`}
              title={`Stack for ${notebook.name}`}
              value={notebook.stackId ?? ""}
              onChange={(event) =>
                onMove(notebook.id, event.target.value || null)
              }
            >
              <option value="">No stack</option>
              {stacks.map((stack) => (
                <option key={stack.id} value={stack.id}>
                  {stack.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={`Rename ${notebook.name}`}
              onClick={() => onRename(notebook)}
            >
              Edit
            </button>
            <button
              type="button"
              aria-label={`Delete ${notebook.name}`}
              onClick={() => onDelete(notebook)}
            >
              Delete
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function NotebookSection({
  selectedNotebookId,
  onSelectNotebook,
}: NotebookSectionProps) {
  const notebooks = useNotebooks();
  const stacks = useNotebookStacks();
  const createNotebook = useCreateNotebook();
  const renameNotebook = useRenameNotebook();
  const deleteNotebook = useDeleteNotebook();
  const createStack = useCreateNotebookStack();
  const renameStack = useRenameNotebookStack();
  const deleteStack = useDeleteNotebookStack();
  const moveNotebook = useMoveNotebookToStack();
  const [editor, setEditor] = useState<"notebook" | "stack" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [renamingNotebook, setRenamingNotebook] = useState<Notebook | null>(
    null,
  );
  const [renamingStack, setRenamingStack] = useState<NotebookStack | null>(
    null,
  );
  const [deletingNotebook, setDeletingNotebook] = useState<Notebook | null>(
    null,
  );
  const [deletingStack, setDeletingStack] = useState<NotebookStack | null>(
    null,
  );

  function resetEditor() {
    setEditor(null);
    setRenamingNotebook(null);
    setRenamingStack(null);
    setDraftName("");
  }

  function beginCreate(kind: "notebook" | "stack") {
    resetEditor();
    setEditor(kind);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name || !editor) return;

    if (renamingNotebook) {
      renameNotebook.mutate(
        { id: renamingNotebook.id, name },
        { onSuccess: resetEditor },
      );
    } else if (renamingStack) {
      renameStack.mutate(
        { id: renamingStack.id, name },
        { onSuccess: resetEditor },
      );
    } else if (editor === "notebook") {
      createNotebook.mutate(name, { onSuccess: resetEditor });
    } else {
      createStack.mutate(name, { onSuccess: resetEditor });
    }
  }

  const notebookData = notebooks.data ?? [];
  const stackData = stacks.data ?? [];
  const ungrouped = notebookData.filter(
    (notebook) => notebook.stackId === null,
  );
  const error =
    notebooks.error ??
    stacks.error ??
    createNotebook.error ??
    renameNotebook.error ??
    deleteNotebook.error ??
    createStack.error ??
    renameStack.error ??
    deleteStack.error ??
    moveNotebook.error;

  const rowProps = {
    stacks: stackData,
    selectedNotebookId,
    onSelectNotebook,
    onRename: (notebook: Notebook) => {
      resetEditor();
      setEditor("notebook");
      setDraftName(notebook.name);
      setRenamingNotebook(notebook);
    },
    onDelete: setDeletingNotebook,
    onMove: (id: string, stackId: string | null) =>
      moveNotebook.mutate({ id, stackId }),
  };

  return (
    <section className="notebook-section" aria-labelledby="notebooks-label">
      <header className="sidebar-section-header">
        <p className="section-label sidebar-section-label" id="notebooks-label">
          Notebooks
        </p>
        <span className="sidebar-header-actions">
          <button
            className="sidebar-icon-button"
            type="button"
            aria-label="Create notebook"
            title="Create notebook"
            onClick={() => beginCreate("notebook")}
          >
            +
          </button>
          <button
            className="sidebar-icon-button stack-button"
            type="button"
            aria-label="Create stack"
            title="Create stack"
            onClick={() => beginCreate("stack")}
          >
            ≡
          </button>
        </span>
      </header>

      {editor ? (
        <form className="notebook-form" onSubmit={submit}>
          <input
            aria-label={
              editor === "notebook"
                ? renamingNotebook
                  ? "Notebook name"
                  : "New notebook name"
                : renamingStack
                  ? "Stack name"
                  : "New stack name"
            }
            value={draftName}
            placeholder={`${editor === "stack" ? "Stack" : "Notebook"} name`}
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

      {notebooks.isPending || stacks.isPending ? (
        <p className="sidebar-status">Loading…</p>
      ) : notebooks.isError || stacks.isError ? (
        <button
          className="sidebar-status"
          type="button"
          onClick={() => {
            void notebooks.refetch();
            void stacks.refetch();
          }}
        >
          Try loading notebooks again
        </button>
      ) : notebookData.length === 0 && !editor ? (
        <p className="sidebar-status">No notebooks yet</p>
      ) : (
        <div className="notebook-groups">
          <NotebookRows notebooks={ungrouped} {...rowProps} />
          {stackData.map((stack) => (
            <section
              className="notebook-stack"
              key={stack.id}
              aria-label={stack.name}
            >
              <header>
                <h3>{stack.name}</h3>
                <span className="notebook-stack-actions">
                  <button
                    type="button"
                    aria-label={`Rename stack ${stack.name}`}
                    onClick={() => {
                      resetEditor();
                      setEditor("stack");
                      setDraftName(stack.name);
                      setRenamingStack(stack);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete stack ${stack.name}`}
                    onClick={() => setDeletingStack(stack)}
                  >
                    Delete
                  </button>
                </span>
              </header>
              <NotebookRows
                notebooks={notebookData.filter(
                  (notebook) => notebook.stackId === stack.id,
                )}
                {...rowProps}
              />
            </section>
          ))}
        </div>
      )}

      {error ? (
        <p className="sidebar-error" role="alert">
          {error.message}
        </p>
      ) : null}

      {deletingNotebook ? (
        <ConfirmDialog
          title={`Delete “${deletingNotebook.name}”?`}
          description="The notebook must be empty before it can be deleted. This action cannot be undone."
          confirmLabel="Delete notebook"
          isPending={deleteNotebook.isPending}
          onCancel={() => setDeletingNotebook(null)}
          onConfirm={() =>
            deleteNotebook.mutate(deletingNotebook.id, {
              onSuccess: () => setDeletingNotebook(null),
            })
          }
        />
      ) : null}

      {deletingStack ? (
        <ConfirmDialog
          title={`Delete stack “${deletingStack.name}”?`}
          description="Its notebooks will remain available without a stack. This action cannot be undone."
          confirmLabel="Delete stack"
          isPending={deleteStack.isPending}
          onCancel={() => setDeletingStack(null)}
          onConfirm={() =>
            deleteStack.mutate(deletingStack.id, {
              onSuccess: () => setDeletingStack(null),
            })
          }
        />
      ) : null}
    </section>
  );
}

export default NotebookSection;

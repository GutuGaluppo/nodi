import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Notebook } from "../db/repositories/notebookRepository";
import {
  createNotebook,
  deleteNotebook,
  listNotebooks,
  moveNotebookToStack,
  renameNotebook,
} from "../db/repositories/notebookRepository";
import type { NotebookStack } from "../db/repositories/notebookStackRepository";
import {
  createNotebookStack,
  deleteNotebookStack,
  listNotebookStacks,
  renameNotebookStack,
} from "../db/repositories/notebookStackRepository";
import type { Note, NoteSummary } from "../db/repositories/noteRepository";
import {
  createNote,
  getNoteById,
  listNotes,
  permanentlyDeleteNote,
  restoreNote,
  searchNotes,
  softDeleteNote,
  updateNote,
} from "../db/repositories/noteRepository";
import {
  addTagToNote,
  listTagsForNote,
  removeTagFromNote,
} from "../db/repositories/noteTagRepository";
import type { SavedSearch } from "../db/repositories/savedSearchRepository";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
} from "../db/repositories/savedSearchRepository";
import {
  addShortcut,
  listShortcuts,
  removeShortcut,
} from "../db/repositories/shortcutRepository";
import type { Tag } from "../db/repositories/tagRepository";
import {
  createTag,
  deleteTag,
  listTags,
  renameTag,
} from "../db/repositories/tagRepository";
import App from "./App";

vi.mock("../db/repositories/noteRepository", () => ({
  listNotes: vi.fn(),
  createNote: vi.fn(),
  getNoteById: vi.fn(),
  updateNote: vi.fn(),
  softDeleteNote: vi.fn(),
  restoreNote: vi.fn(),
  permanentlyDeleteNote: vi.fn(),
  searchNotes: vi.fn(),
  EMPTY_NOTE_CONTENT_JSON: '{"type":"doc","content":[{"type":"paragraph"}]}',
}));

vi.mock("../db/repositories/noteTagRepository", () => ({
  listTagsForNote: vi.fn(),
  addTagToNote: vi.fn(),
  removeTagFromNote: vi.fn(),
}));

vi.mock("../db/repositories/notebookRepository", () => ({
  listNotebooks: vi.fn(),
  createNotebook: vi.fn(),
  renameNotebook: vi.fn(),
  deleteNotebook: vi.fn(),
  moveNotebookToStack: vi.fn(),
}));

vi.mock("../db/repositories/notebookStackRepository", () => ({
  listNotebookStacks: vi.fn(),
  createNotebookStack: vi.fn(),
  renameNotebookStack: vi.fn(),
  deleteNotebookStack: vi.fn(),
}));

vi.mock("../db/repositories/tagRepository", () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  renameTag: vi.fn(),
  deleteTag: vi.fn(),
}));

vi.mock("../db/repositories/shortcutRepository", () => ({
  listShortcuts: vi.fn(),
  addShortcut: vi.fn(),
  removeShortcut: vi.fn(),
}));

vi.mock("../db/repositories/savedSearchRepository", () => ({
  listSavedSearches: vi.fn(),
  createSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
}));

const newNote: Note = {
  id: "new-1",
  title: "",
  contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
  contentText: "",
  notebookId: null,
  isPinned: false,
  createdAt: "2026-09-07T12:00:00.000Z",
  updatedAt: "2026-09-07T12:00:00.000Z",
  deletedAt: null,
  revision: 1,
  deviceId: "device-1",
};

const newNoteSummary: NoteSummary = {
  id: "new-1",
  title: "",
  contentText: "",
  notebookId: null,
  isPinned: false,
  createdAt: newNote.createdAt,
  updatedAt: newNote.updatedAt,
  deletedAt: null,
};

const notebook: Notebook = {
  id: "nb-1",
  name: "Projects",
  stackId: null,
  createdAt: "2026-09-07T12:00:00.000Z",
  updatedAt: "2026-09-07T12:00:00.000Z",
  deletedAt: null,
};

const stack: NotebookStack = {
  id: "stack-1",
  name: "Work",
  createdAt: "2026-09-07T12:00:00.000Z",
  updatedAt: "2026-09-07T12:00:00.000Z",
};

const tag: Tag = {
  id: "tag-1",
  name: "ideas",
  createdAt: "2026-09-07T12:00:00.000Z",
  updatedAt: "2026-09-07T12:00:00.000Z",
};

const savedSearch: SavedSearch = {
  id: "saved-1",
  name: "Project ideas",
  query: "tag:ideas roadmap",
  createdAt: "2026-09-08T12:00:00.000Z",
  updatedAt: "2026-09-08T12:00:00.000Z",
};

describe("NODI app", () => {
  beforeEach(() => {
    vi.mocked(listNotes).mockReset().mockResolvedValue([]);
    vi.mocked(createNote).mockReset().mockResolvedValue(newNote);
    vi.mocked(getNoteById).mockReset().mockResolvedValue(newNote);
    vi.mocked(updateNote)
      .mockReset()
      .mockResolvedValue({ ...newNote, title: "Updated" });
    vi.mocked(softDeleteNote).mockReset().mockResolvedValue(undefined);
    vi.mocked(restoreNote).mockReset().mockResolvedValue(undefined);
    vi.mocked(permanentlyDeleteNote).mockReset().mockResolvedValue(undefined);
    vi.mocked(searchNotes).mockReset().mockResolvedValue([]);
    vi.mocked(listNotebooks).mockReset().mockResolvedValue([]);
    vi.mocked(createNotebook).mockReset().mockResolvedValue(notebook);
    vi.mocked(renameNotebook).mockReset().mockResolvedValue(undefined);
    vi.mocked(deleteNotebook).mockReset().mockResolvedValue(undefined);
    vi.mocked(moveNotebookToStack).mockReset().mockResolvedValue(undefined);
    vi.mocked(listNotebookStacks).mockReset().mockResolvedValue([]);
    vi.mocked(createNotebookStack).mockReset().mockResolvedValue(stack);
    vi.mocked(renameNotebookStack).mockReset().mockResolvedValue(undefined);
    vi.mocked(deleteNotebookStack).mockReset().mockResolvedValue(undefined);
    vi.mocked(listTags).mockReset().mockResolvedValue([]);
    vi.mocked(createTag).mockReset().mockResolvedValue(tag);
    vi.mocked(renameTag).mockReset().mockResolvedValue(undefined);
    vi.mocked(deleteTag).mockReset().mockResolvedValue(undefined);
    vi.mocked(listTagsForNote).mockReset().mockResolvedValue([]);
    vi.mocked(addTagToNote).mockReset().mockResolvedValue(undefined);
    vi.mocked(removeTagFromNote).mockReset().mockResolvedValue(undefined);
    vi.mocked(listShortcuts).mockReset().mockResolvedValue([]);
    vi.mocked(addShortcut).mockReset().mockResolvedValue(undefined);
    vi.mocked(removeShortcut).mockReset().mockResolvedValue(undefined);
    vi.mocked(listSavedSearches).mockReset().mockResolvedValue([]);
    vi.mocked(createSavedSearch).mockReset().mockResolvedValue(savedSearch);
    vi.mocked(deleteSavedSearch).mockReset().mockResolvedValue(undefined);
  });

  it("renders the NODI baseline", async () => {
    render(<App />);

    expect(
      screen.getByRole("button", { name: "New note" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "NODI" })).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Sidebar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Notes" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Nothing selected" }),
    ).toBeInTheDocument();

    expect(await screen.findByText("No notes yet")).toBeInTheDocument();
  });

  it("collapses and restores the Library", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Collapse Library" }));
    expect(
      screen.queryByRole("region", { name: "Notes" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Library" }));
    expect(screen.getByRole("region", { name: "Notes" })).toBeInTheDocument();
  });

  it("opens and closes the visual history", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByLabelText("Settings"));
    await user.click(screen.getByRole("button", { name: "About NODI" }));

    expect(
      screen.getByRole("heading", { name: "The making of NODI" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "NODI implementation history" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(38);

    await user.click(screen.getByRole("button", { name: "Back to NODI" }));

    expect(
      screen.getByRole("button", { name: "New note" }),
    ).toBeInTheDocument();
  });

  it("applies and stores an explicit theme preference", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("switch", { name: "Dark mode" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("nodi.theme")).toBe("dark");
    expect(screen.getByRole("switch", { name: "Dark mode" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("opens search with Cmd/Ctrl+K and supports keyboard result selection", async () => {
    const user = userEvent.setup();
    vi.mocked(searchNotes).mockResolvedValue([
      { ...newNoteSummary, title: "Testando primeiro documento" },
    ]);
    render(<App />);

    await user.keyboard("{Control>}k{/Control}");
    const input = screen.getByRole("searchbox", { name: "Search notes" });
    expect(input).toHaveFocus();
    await user.type(input, "autosave");

    expect(
      await screen.findByRole("option", {
        name: /Testando primeiro documento/,
      }),
    ).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("dialog", { name: "Search notes" })).toBeNull();
    await waitFor(() => expect(getNoteById).toHaveBeenCalledWith("new-1"));

    await user.keyboard("{Control>}k{/Control}");
    expect(
      screen.getByRole("dialog", { name: "Search notes" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Search notes" })).toBeNull();
  });

  it("saves a search and reopens its query from the sidebar", async () => {
    const user = userEvent.setup();
    vi.mocked(listSavedSearches)
      .mockResolvedValueOnce([])
      .mockResolvedValue([savedSearch]);
    render(<App />);

    await user.keyboard("{Control>}k{/Control}");
    const query = screen.getByRole("searchbox", { name: "Search notes" });
    await user.type(query, savedSearch.query);
    await user.click(screen.getByRole("button", { name: "Save search" }));
    await user.type(
      screen.getByRole("textbox", { name: "Saved search name" }),
      savedSearch.name,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createSavedSearch).toHaveBeenCalledWith(
        savedSearch.name,
        savedSearch.query,
      ),
    );
    await user.keyboard("{Escape}");
    await user.click(
      await screen.findByRole("button", { name: savedSearch.name }),
    );
    expect(screen.getByRole("searchbox", { name: "Search notes" })).toHaveValue(
      savedSearch.query,
    );
  });

  it("creates, renames, and deletes a notebook", async () => {
    const user = userEvent.setup();
    vi.mocked(listNotebooks)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([notebook])
      .mockResolvedValueOnce([{ ...notebook, name: "Archive" }])
      .mockResolvedValue([]);
    render(<App />);

    await screen.findByText("No notebooks yet");
    await user.click(screen.getByRole("button", { name: "Create notebook" }));
    await user.type(
      screen.getByRole("textbox", { name: "New notebook name" }),
      "Projects",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(createNotebook).toHaveBeenCalledWith("Projects");

    await user.click(
      await screen.findByRole("button", { name: "Rename Projects" }),
    );
    const name = screen.getByRole("textbox", { name: "Notebook name" });
    await user.clear(name);
    await user.type(name, "Archive");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(renameNotebook).toHaveBeenCalledWith("nb-1", "Archive");

    await user.click(
      await screen.findByRole("button", { name: "Delete Archive" }),
    );
    expect(deleteNotebook).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete notebook" }));
    expect(deleteNotebook).toHaveBeenCalledWith("nb-1");
  });

  it("filters notes by the selected notebook", async () => {
    const user = userEvent.setup();
    vi.mocked(listNotebooks).mockResolvedValue([notebook]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Projects" }));

    await waitFor(() =>
      expect(listNotes).toHaveBeenCalledWith({
        deleted: "exclude",
        notebookId: "nb-1",
      }),
    );
    expect(
      screen.getByRole("region", { name: "Projects" }),
    ).toBeInTheDocument();
  });

  it("creates a stack, groups a notebook, renames it, and confirms deletion", async () => {
    const user = userEvent.setup();
    vi.mocked(listNotebooks)
      .mockResolvedValueOnce([notebook])
      .mockResolvedValue([{ ...notebook, stackId: "stack-1" }]);
    vi.mocked(listNotebookStacks)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([stack])
      .mockResolvedValueOnce([{ ...stack, name: "Studio" }])
      .mockResolvedValue([]);
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Create stack" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "New stack name" }),
      "Work",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(createNotebookStack).toHaveBeenCalledWith("Work");

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Stack for Projects" }),
      "stack-1",
    );
    expect(moveNotebookToStack).toHaveBeenCalledWith("nb-1", "stack-1");

    await user.click(
      await screen.findByRole("button", { name: "Rename stack Work" }),
    );
    const name = screen.getByRole("textbox", { name: "Stack name" });
    await user.clear(name);
    await user.type(name, "Studio");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(renameNotebookStack).toHaveBeenCalledWith("stack-1", "Studio");

    await user.click(
      await screen.findByRole("button", { name: "Delete stack Studio" }),
    );
    expect(deleteNotebookStack).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete stack" }));
    expect(deleteNotebookStack).toHaveBeenCalledWith("stack-1");
  });

  it("moves the selected note with the notebook selector", async () => {
    const user = userEvent.setup();
    vi.mocked(listNotebooks).mockResolvedValue([notebook]);
    vi.mocked(listNotes).mockResolvedValue([newNoteSummary]);
    vi.mocked(updateNote).mockResolvedValue({ ...newNote, notebookId: "nb-1" });
    render(<App />);

    await user.click(await screen.findByRole("option", { name: /Untitled/ }));
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Notebook" }),
      "nb-1",
    );

    expect(updateNote).toHaveBeenCalledWith("new-1", { notebookId: "nb-1" });
  });

  it("creates, renames, and confirms deletion of a tag", async () => {
    const user = userEvent.setup();
    vi.mocked(listTags)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([tag])
      .mockResolvedValueOnce([{ ...tag, name: "research" }])
      .mockResolvedValue([]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Create tag" }));
    await user.type(
      screen.getByRole("textbox", { name: "New tag name" }),
      "ideas",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(createTag).toHaveBeenCalledWith("ideas");

    await user.click(
      await screen.findByRole("button", { name: "Rename tag ideas" }),
    );
    const name = screen.getByRole("textbox", { name: "Tag name" });
    await user.clear(name);
    await user.type(name, "research");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(renameTag).toHaveBeenCalledWith("tag-1", "research");

    await user.click(
      await screen.findByRole("button", { name: "Delete tag research" }),
    );
    expect(deleteTag).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete tag" }));
    expect(deleteTag).toHaveBeenCalledWith("tag-1");
  });

  it("filters notes by a selected tag", async () => {
    const user = userEvent.setup();
    vi.mocked(listTags).mockResolvedValue([tag]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "# ideas" }));

    await waitFor(() =>
      expect(listNotes).toHaveBeenCalledWith({
        deleted: "exclude",
        tagId: "tag-1",
      }),
    );
    expect(screen.getByRole("region", { name: "# ideas" })).toBeInTheDocument();
  });

  it("adds and removes multiple note tag relationships accessibly", async () => {
    const user = userEvent.setup();
    vi.mocked(listTags).mockResolvedValue([tag]);
    vi.mocked(listNotes).mockResolvedValue([newNoteSummary]);
    vi.mocked(listTagsForNote)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([tag])
      .mockResolvedValue([]);
    render(<App />);

    await user.click(await screen.findByRole("option", { name: /Untitled/ }));
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Add tag" }),
      "tag-1",
    );
    expect(addTagToNote).toHaveBeenCalledWith("new-1", "tag-1");

    await user.click(
      await screen.findByRole("button", { name: "Remove tag ideas" }),
    );
    expect(removeTagFromNote).toHaveBeenCalledWith("new-1", "tag-1");
  });

  it("adds notes and notebooks to persistent shortcuts", async () => {
    const user = userEvent.setup();
    vi.mocked(listNotebooks).mockResolvedValue([notebook]);
    vi.mocked(listNotes).mockResolvedValue([newNoteSummary]);
    vi.mocked(listShortcuts)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "shortcut-1",
          targetType: "note",
          targetId: "new-1",
          label: "Untitled",
          sortOrder: 0,
          createdAt: "created",
        },
      ])
      .mockResolvedValue([
        {
          id: "shortcut-1",
          targetType: "note",
          targetId: "new-1",
          label: "Untitled",
          sortOrder: 0,
          createdAt: "created",
        },
        {
          id: "shortcut-2",
          targetType: "notebook",
          targetId: "nb-1",
          label: "Projects",
          sortOrder: 1,
          createdAt: "created",
        },
      ]);
    render(<App />);

    await user.click(await screen.findByRole("option", { name: /Untitled/ }));
    await user.click(
      await screen.findByRole("button", { name: "Add Untitled to shortcuts" }),
    );
    expect(addShortcut).toHaveBeenCalledWith("note", "new-1");
    expect(
      await screen.findByRole("button", { name: "Untitled" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Add Projects to shortcuts" }),
    );
    expect(addShortcut).toHaveBeenCalledWith("notebook", "nb-1");
    expect(
      await screen.findAllByRole("button", { name: "Projects" }),
    ).toHaveLength(2);
  });

  it("creates, selects, and focuses a new note from the sidebar", async () => {
    const user = userEvent.setup();
    vi.mocked(listNotes)
      .mockResolvedValueOnce([])
      .mockResolvedValue([newNoteSummary]);
    render(<App />);
    await screen.findByText("No notes yet");

    await user.click(screen.getByRole("button", { name: "New note" }));

    expect(createNote).toHaveBeenCalledOnce();

    const listbox = await screen.findByRole("listbox", { name: "Notes" });
    const option = await within(listbox).findByRole("option");
    expect(option).toHaveAttribute("aria-selected", "true");

    const editor = await screen.findByRole("textbox", { name: "Note body" });
    await waitFor(() => expect(editor).toHaveFocus());
  });

  it("creates a note with the Cmd/Ctrl+N shortcut", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("No notes yet");

    await user.keyboard("{Control>}n{/Control}");

    expect(createNote).toHaveBeenCalledOnce();
  });

  it("moves a selected note to Trash and removes it from the active list", async () => {
    const user = userEvent.setup();
    vi.mocked(listNotes)
      .mockResolvedValueOnce([newNoteSummary])
      .mockResolvedValue([]);
    render(<App />);

    await user.click(await screen.findByRole("option", { name: /Untitled/ }));
    await user.click(
      await screen.findByRole("button", { name: "Move to Trash" }),
    );

    expect(softDeleteNote).toHaveBeenCalledWith("new-1");
    expect(
      await screen.findByRole("region", { name: "Nothing selected" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
  });

  it("restores a selected note from Trash", async () => {
    const user = userEvent.setup();
    const trashed = {
      ...newNoteSummary,
      deletedAt: "2026-09-07T13:00:00.000Z",
    };
    vi.mocked(listNotes)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([trashed])
      .mockResolvedValue([]);
    render(<App />);

    await screen.findByText("No notes yet");
    await user.click(screen.getByRole("button", { name: "Trash" }));
    await user.click(await screen.findByRole("option", { name: /Untitled/ }));
    await user.click(
      await screen.findByRole("button", { name: "Restore note" }),
    );

    expect(restoreNote).toHaveBeenCalledWith("new-1");
    expect(await screen.findByText("Trash is empty")).toBeInTheDocument();
  });

  it("requires confirmation before permanently deleting a note", async () => {
    const user = userEvent.setup();
    const trashed = {
      ...newNoteSummary,
      deletedAt: "2026-09-07T13:00:00.000Z",
    };
    vi.mocked(listNotes)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([trashed])
      .mockResolvedValue([]);
    render(<App />);

    await screen.findByText("No notes yet");
    await user.click(screen.getByRole("button", { name: "Trash" }));
    await user.click(await screen.findByRole("option", { name: /Untitled/ }));
    await user.click(
      await screen.findByRole("button", { name: "Delete permanently" }),
    );

    expect(permanentlyDeleteNote).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete forever" }));

    expect(permanentlyDeleteNote).toHaveBeenCalledWith("new-1");
    expect(await screen.findByText("Trash is empty")).toBeInTheDocument();
  });
});

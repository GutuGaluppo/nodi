import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Notebook } from "../db/repositories/notebookRepository";
import {
  createNotebook,
  deleteNotebook,
  listNotebooks,
  renameNotebook,
} from "../db/repositories/notebookRepository";
import type { Note, NoteSummary } from "../db/repositories/noteRepository";
import {
  createNote,
  getNoteById,
  listNotes,
  permanentlyDeleteNote,
  restoreNote,
  softDeleteNote,
  updateNote,
} from "../db/repositories/noteRepository";
import App from "./App";

vi.mock("../db/repositories/noteRepository", () => ({
  listNotes: vi.fn(),
  createNote: vi.fn(),
  getNoteById: vi.fn(),
  updateNote: vi.fn(),
  softDeleteNote: vi.fn(),
  restoreNote: vi.fn(),
  permanentlyDeleteNote: vi.fn(),
  EMPTY_NOTE_CONTENT_JSON: '{"type":"doc","content":[{"type":"paragraph"}]}',
}));

vi.mock("../db/repositories/notebookRepository", () => ({
  listNotebooks: vi.fn(),
  createNotebook: vi.fn(),
  renameNotebook: vi.fn(),
  deleteNotebook: vi.fn(),
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
    vi.mocked(listNotebooks).mockReset().mockResolvedValue([]);
    vi.mocked(createNotebook).mockReset().mockResolvedValue(notebook);
    vi.mocked(renameNotebook).mockReset().mockResolvedValue(undefined);
    vi.mocked(deleteNotebook).mockReset().mockResolvedValue(undefined);
  });

  it("renders the NODI baseline", async () => {
    render(<App />);

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

  it("opens and closes the visual history", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "About" }));

    expect(
      screen.getByRole("heading", { name: "The making of NODI" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "NODI implementation history" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(21);

    await user.click(screen.getByRole("button", { name: "Back to NODI" }));

    expect(screen.getByRole("heading", { name: "NODI" })).toBeInTheDocument();
  });

  it("applies and stores an explicit theme preference", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("nodi.theme")).toBe("dark");
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

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note, NoteSummary } from "../db/repositories/noteRepository";
import {
  createNote,
  getNoteById,
  listNotes,
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
  EMPTY_NOTE_CONTENT_JSON: '{"type":"doc","content":[{"type":"paragraph"}]}',
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

describe("NODI app", () => {
  beforeEach(() => {
    vi.mocked(listNotes).mockReset().mockResolvedValue([]);
    vi.mocked(createNote).mockReset().mockResolvedValue(newNote);
    vi.mocked(getNoteById).mockReset().mockResolvedValue(newNote);
    vi.mocked(updateNote)
      .mockReset()
      .mockResolvedValue({ ...newNote, title: "Updated" });
    vi.mocked(softDeleteNote).mockReset().mockResolvedValue(undefined);
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
    expect(screen.getAllByRole("img")).toHaveLength(18);

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
});

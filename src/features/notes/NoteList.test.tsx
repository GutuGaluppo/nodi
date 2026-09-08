import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import type { NoteSummary } from "../../db/repositories/noteRepository";
import { listNotes } from "../../db/repositories/noteRepository";
import NoteList from "./NoteList";

vi.mock("../../db/repositories/noteRepository", () => ({
  listNotes: vi.fn(),
}));

const listNotesMock = vi.mocked(listNotes);

function summary(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "n1",
    title: "Note one",
    contentText: "The body of note one",
    notebookId: null,
    isPinned: false,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function renderNoteList(
  props: {
    selectedNoteId?: string | null;
    onSelectNote?: (id: string) => void;
  } = {},
) {
  const onSelectNote = props.onSelectNote ?? vi.fn();
  const view = render(
    <QueryClientProvider client={createQueryClient()}>
      <NoteList
        view="notes"
        selectedNoteId={props.selectedNoteId ?? null}
        onSelectNote={onSelectNote}
        onCollapse={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { ...view, onSelectNote };
}

describe("NoteList", () => {
  beforeEach(() => {
    listNotesMock.mockReset().mockResolvedValue([]);
  });

  it("shows a loading state before the notes arrive", () => {
    listNotesMock.mockReturnValue(new Promise(() => {}));
    renderNoteList();

    expect(screen.getByRole("status")).toHaveTextContent("Loading your notes…");
  });

  it("renders notes in the order the repository returns them", async () => {
    listNotesMock.mockResolvedValue([
      summary({ id: "a", title: "Alpha" }),
      summary({ id: "b", title: "Bravo" }),
    ]);
    renderNoteList();

    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Alpha");
    expect(options[1]).toHaveTextContent("Bravo");
    expect(screen.getByText("2 notes")).toBeInTheDocument();
  });

  it("shows the empty state when there are no notes", async () => {
    renderNoteList();

    expect(await screen.findByText("No notes yet")).toBeInTheDocument();
  });

  it("shows an error state and recovers on retry", async () => {
    const user = userEvent.setup();
    listNotesMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([summary({ id: "a", title: "Recovered" })]);
    renderNoteList();

    const alert = await screen.findByRole("alert");
    await user.click(within(alert).getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Recovered")).toBeInTheDocument();
  });

  it("selects a note when it is clicked", async () => {
    const user = userEvent.setup();
    listNotesMock.mockResolvedValue([summary({ id: "a", title: "Alpha" })]);
    const { onSelectNote } = renderNoteList();

    await user.click(await screen.findByRole("option", { name: /Alpha/ }));

    expect(onSelectNote).toHaveBeenCalledWith("a");
  });

  it("marks the selected note with aria-selected", async () => {
    listNotesMock.mockResolvedValue([summary({ id: "a", title: "Alpha" })]);
    renderNoteList({ selectedNoteId: "a" });

    const option = await screen.findByRole("option", { name: /Alpha/ });
    expect(option).toHaveAttribute("aria-selected", "true");
  });

  it("moves the selection with the arrow keys", async () => {
    listNotesMock.mockResolvedValue([
      summary({ id: "a", title: "Alpha" }),
      summary({ id: "b", title: "Bravo" }),
    ]);
    const { onSelectNote } = renderNoteList({ selectedNoteId: "a" });

    const listbox = await screen.findByRole("listbox", { name: "Notes" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });

    expect(onSelectNote).toHaveBeenCalledWith("b");
  });

  it("renders a plain-text preview and an Untitled fallback", async () => {
    listNotesMock.mockResolvedValue([
      summary({ id: "a", title: "  ", contentText: "just the body" }),
    ]);
    renderNoteList();

    expect(await screen.findByText("Untitled")).toBeInTheDocument();
    expect(screen.getByText("just the body")).toBeInTheDocument();
  });
});

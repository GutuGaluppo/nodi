import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import type { Note } from "../../db/repositories/noteRepository";
import { updateNote } from "../../db/repositories/noteRepository";
import NoteTitle from "./NoteTitle";

vi.mock("../../db/repositories/noteRepository", () => ({
  updateNote: vi.fn(),
}));

const note: Note = {
  id: "n1",
  title: "Before",
  contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
  contentText: "",
  notebookId: null,
  isPinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  revision: 1,
  deviceId: "device-1",
};

function renderTitle() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <NoteTitle note={note} />
    </QueryClientProvider>,
  );
}

describe("NoteTitle", () => {
  beforeEach(() => {
    vi.mocked(updateNote)
      .mockReset()
      .mockResolvedValue({ ...note, title: "After", revision: 2 });
  });

  it("persists a changed title when focus leaves the field", async () => {
    const user = userEvent.setup();
    renderTitle();

    const input = screen.getByRole("textbox", { name: "Note title" });
    await user.clear(input);
    await user.type(input, "After");
    await user.tab();

    await waitFor(() =>
      expect(updateNote).toHaveBeenCalledWith("n1", { title: "After" }),
    );
  });

  it("shows Untitled without persisting an unchanged empty title", () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <NoteTitle note={{ ...note, title: "" }} />
      </QueryClientProvider>,
    );

    expect(screen.getByPlaceholderText("Untitled")).toHaveValue("");
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("keeps the draft and surfaces a failed save", async () => {
    vi.mocked(updateNote).mockRejectedValueOnce(new Error("disk full"));
    const user = userEvent.setup();
    renderTitle();

    const input = screen.getByRole("textbox", { name: "Note title" });
    await user.clear(input);
    await user.type(input, "Unsaved title");
    await user.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your text is still here",
    );
    expect(input).toHaveValue("Unsaved title");
  });
});

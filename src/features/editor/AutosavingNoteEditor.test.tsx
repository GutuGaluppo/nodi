import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import type { Note } from "../../db/repositories/noteRepository";
import AutosavingNoteEditor from "./AutosavingNoteEditor";

const update = vi.hoisted(() => vi.fn());

vi.mock("../notes/useUpdateNote", () => ({
  useUpdateNote: () => ({ mutateAsync: update }),
}));

vi.mock("../../editor/NoteEditor", () => ({
  default: ({
    onChange,
  }: {
    onChange: (draft: { contentJson: string; contentText: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          contentJson: '{"type":"doc","content":[]}',
          contentText: "Draft remains visible",
        })
      }
    >
      Edit body
    </button>
  ),
}));

const note: Note = {
  id: "n1",
  title: "A note",
  contentJson: '{"type":"doc","content":[]}',
  contentText: "",
  notebookId: null,
  isPinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  revision: 1,
  deviceId: "device-1",
};

describe("AutosavingNoteEditor", () => {
  beforeEach(() => {
    update
      .mockReset()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);
  });

  it("surfaces a failed save and retries the retained draft", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <AutosavingNoteEditor note={note} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Edit body" }));
    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith({
      id: "n1",
      patch: {
        contentJson: '{"type":"doc","content":[]}',
        contentText: "Draft remains visible",
      },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });
});

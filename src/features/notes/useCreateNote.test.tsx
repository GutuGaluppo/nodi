import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import type { Note } from "../../db/repositories/noteRepository";
import { createNote, listNotes } from "../../db/repositories/noteRepository";
import { useCreateNote } from "./useCreateNote";
import { useNotes } from "./useNotes";

vi.mock("../../db/repositories/noteRepository", () => ({
  createNote: vi.fn(),
  listNotes: vi.fn(),
}));

const createdNote: Note = {
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

describe("useCreateNote", () => {
  beforeEach(() => {
    vi.mocked(createNote).mockReset().mockResolvedValue(createdNote);
    vi.mocked(listNotes).mockReset().mockResolvedValue([]);
  });

  it("persists a note and invalidates the note list", async () => {
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => ({ create: useCreateNote(), notes: useNotes() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.notes.isSuccess).toBe(true));
    vi.mocked(listNotes).mockResolvedValue([
      { ...createdNote, contentText: "" },
    ]);

    const note = await result.current.create.mutateAsync(undefined);
    expect(note).toEqual(createdNote);
    expect(createNote).toHaveBeenCalledOnce();

    await waitFor(() => expect(result.current.notes.data).toHaveLength(1));
  });
});

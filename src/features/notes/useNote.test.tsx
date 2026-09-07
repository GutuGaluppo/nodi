import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import type { Note } from "../../db/repositories/noteRepository";
import { getNoteById } from "../../db/repositories/noteRepository";
import { useNote } from "./useNote";

vi.mock("../../db/repositories/noteRepository", () => ({
  getNoteById: vi.fn(),
}));

const note: Note = {
  id: "n1",
  title: "A note",
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

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("useNote", () => {
  beforeEach(() => {
    vi.mocked(getNoteById).mockReset().mockResolvedValue(note);
  });

  it("loads the full note when an id is given", async () => {
    const { result } = renderHook(() => useNote("n1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(note);
    expect(getNoteById).toHaveBeenCalledWith("n1");
  });

  it("stays idle and does not query when no note is selected", () => {
    const { result } = renderHook(() => useNote(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(getNoteById).not.toHaveBeenCalled();
  });
});

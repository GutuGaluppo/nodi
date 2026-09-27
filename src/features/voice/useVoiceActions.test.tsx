import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import {
  createNotebook,
  listNotebooks,
} from "../../db/repositories/notebookRepository";
import { updateNote } from "../../db/repositories/noteRepository";
import { addTagToNote } from "../../db/repositories/noteTagRepository";
import { createTag, listTags } from "../../db/repositories/tagRepository";
import { useVoiceActions } from "./useVoiceActions";

vi.mock("../../db/repositories/noteRepository", () => ({
  updateNote: vi.fn(),
}));
vi.mock("../../db/repositories/notebookRepository", () => ({
  listNotebooks: vi.fn(),
  createNotebook: vi.fn(),
  deleteNotebook: vi.fn(),
  renameNotebook: vi.fn(),
}));
vi.mock("../../db/repositories/tagRepository", () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  renameTag: vi.fn(),
}));
vi.mock("../../db/repositories/noteTagRepository", () => ({
  addTagToNote: vi.fn(),
  removeTagFromNote: vi.fn(),
  listTagsForNote: vi.fn(),
}));

const stamp = "2026-09-27T00:00:00.000Z";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("useVoiceActions", () => {
  beforeEach(() => {
    vi.mocked(listNotebooks).mockResolvedValue([
      {
        id: "nb-1",
        name: "Casa",
        stackId: null,
        createdAt: stamp,
        updatedAt: stamp,
        deletedAt: null,
      },
    ]);
    vi.mocked(listTags).mockResolvedValue([
      { id: "tag-1", name: "Mercado", createdAt: stamp, updatedAt: stamp },
    ]);
    vi.mocked(updateNote)
      .mockReset()
      .mockImplementation(
        async (id) =>
          ({ id }) as unknown as Awaited<ReturnType<typeof updateNote>>,
      );
    vi.mocked(createNotebook).mockReset();
    vi.mocked(createTag).mockReset().mockResolvedValue({
      id: "tag-new",
      name: "urgente",
      createdAt: stamp,
      updatedAt: stamp,
    });
    vi.mocked(addTagToNote).mockReset().mockResolvedValue();
  });

  it("resolves spoken names against existing notebooks and tags", async () => {
    const { result } = renderHook(
      () =>
        useVoiceActions({
          title: "Feira",
          notebook: "casa",
          tags: ["mercado", "urgente", "Mercado"],
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.actions).toEqual([
      { key: "title", kind: "title", value: "Feira" },
      {
        key: "notebook",
        kind: "notebook",
        target: { id: "nb-1", name: "Casa" },
      },
      {
        key: "tag:tag-1",
        kind: "tag",
        target: { id: "tag-1", name: "Mercado" },
      },
      { key: "tag:urgente", kind: "tag", target: { name: "urgente" } },
    ]);
  });

  it("applies the chosen actions and creates only new tags", async () => {
    const { result } = renderHook(
      () =>
        useVoiceActions({
          title: "Feira",
          notebook: "Casa",
          tags: ["mercado", "urgente"],
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await result.current.apply("note-1", result.current.actions);

    expect(updateNote).toHaveBeenCalledWith("note-1", { title: "Feira" });
    expect(updateNote).toHaveBeenCalledWith("note-1", { notebookId: "nb-1" });
    expect(createNotebook).not.toHaveBeenCalled();
    expect(createTag).toHaveBeenCalledOnce();
    expect(createTag).toHaveBeenCalledWith("urgente");
    expect(addTagToNote).toHaveBeenCalledWith("note-1", "tag-1");
    expect(addTagToNote).toHaveBeenCalledWith("note-1", "tag-new");
  });

  it("creates a new notebook only when the user inserts", async () => {
    vi.mocked(createNotebook).mockResolvedValue({
      id: "nb-new",
      name: "Viagens",
      stackId: null,
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
    });
    const { result } = renderHook(
      () => useVoiceActions({ notebook: "Viagens", tags: [] }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(createNotebook).not.toHaveBeenCalled();

    await result.current.apply("note-1", result.current.actions);

    expect(createNotebook).toHaveBeenCalledWith("Viagens");
    expect(updateNote).toHaveBeenCalledWith("note-1", { notebookId: "nb-new" });
  });

  it("skips actions the user removed", async () => {
    const { result } = renderHook(
      () => useVoiceActions({ notebook: "Casa", tags: ["urgente"] }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await result.current.apply(
      "note-1",
      result.current.actions.filter((action) => action.kind !== "tag"),
    );

    expect(createTag).not.toHaveBeenCalled();
    expect(addTagToNote).not.toHaveBeenCalled();
  });
});

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/providers";
import { listEmbeddings } from "../../db/repositories/embeddingRepository";
import RelatedNotes from "./RelatedNotes";
import { encodeVector } from "./similarity";

vi.mock("../../db/repositories/embeddingRepository", () => ({
  listEmbeddings: vi.fn(),
}));

function stored(noteId: string, title: string, vector: number[]) {
  return { noteId, title, language: "en", vector: encodeVector(vector) };
}

function renderPanel(onOpenNote = vi.fn()) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RelatedNotes noteId="launch" onOpenNote={onOpenNote} />
    </QueryClientProvider>,
  );
  return onOpenNote;
}

describe("RelatedNotes", () => {
  it("lists close notes and opens one", async () => {
    vi.mocked(listEmbeddings).mockResolvedValue([
      stored("launch", "Launch plan", [1, 0]),
      stored("sync", "Weekly sync", [0.95, 0.2]),
      stored("groceries", "Groceries", [0, 1]),
    ]);
    const user = userEvent.setup();
    const onOpenNote = renderPanel();

    const button = await screen.findByRole("button", { name: "Weekly sync" });
    expect(
      screen.queryByRole("button", { name: "Groceries" }),
    ).not.toBeInTheDocument();
    await user.click(button);

    expect(onOpenNote).toHaveBeenCalledWith("sync");
  });

  it("shows nothing when no note is close enough", async () => {
    vi.mocked(listEmbeddings).mockResolvedValue([
      stored("launch", "Launch plan", [1, 0]),
      stored("groceries", "Groceries", [0, 1]),
    ]);
    renderPanel();

    await waitFor(() => expect(listEmbeddings).toHaveBeenCalled());
    expect(
      screen.queryByRole("complementary", { name: "Related notes" }),
    ).not.toBeInTheDocument();
  });
});

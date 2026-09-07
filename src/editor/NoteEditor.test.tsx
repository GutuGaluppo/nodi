import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Note } from "../db/repositories/noteRepository";
import NoteEditor from "./NoteEditor";

function paragraphDoc(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "n1",
    title: "A note",
    contentJson: paragraphDoc("Hello world"),
    contentText: "Hello world",
    notebookId: null,
    isPinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    revision: 1,
    deviceId: "device-1",
    ...overrides,
  };
}

const TOOLBAR_BUTTONS = [
  "Bold",
  "Italic",
  "Underline",
  "Highlight",
  "Heading 1",
  "Heading 2",
  "Bullet list",
  "Numbered list",
  "Task list",
  "Link",
  "Insert table",
];

describe("NoteEditor", () => {
  it("renders the note body and the full formatting toolbar", () => {
    render(<NoteEditor note={makeNote()} />);

    expect(
      screen.getByRole("textbox", { name: "Note body" }),
    ).toHaveTextContent("Hello world");

    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    for (const name of TOOLBAR_BUTTONS) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(toolbar).toBeInTheDocument();
  });

  it("reflects a block format toggled from the toolbar", async () => {
    const user = userEvent.setup();
    render(<NoteEditor note={makeNote()} />);

    await user.click(screen.getByRole("textbox", { name: "Note body" }));
    const heading = screen.getByRole("button", { name: "Heading 1" });
    expect(heading).toHaveAttribute("aria-pressed", "false");

    await user.click(heading);

    expect(heading).toHaveAttribute("aria-pressed", "true");
  });

  it("replaces the content when a different note is shown", () => {
    const { rerender } = render(
      <NoteEditor
        note={makeNote({ id: "a", contentJson: paragraphDoc("First") })}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveTextContent("First");

    rerender(
      <NoteEditor
        note={makeNote({ id: "b", contentJson: paragraphDoc("Second") })}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveTextContent("Second");
  });
});

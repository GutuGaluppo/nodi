import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorExtensions } from "../editorExtensions";
import { formatTimestamp } from "./VoiceRecordingView";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost${path}`,
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: async () => "/Users/me/Library/Application Support/com.nodi.app",
  join: async (...parts: string[]) => parts.join("/"),
}));

const recording = {
  type: "voiceRecording",
  attrs: {
    attachmentId: "a1",
    src: "attachments/ab/abcdef/recording.wav",
    durationMs: 75_000,
    segments: [
      { startMs: 0, endMs: 4_000, text: "We decided to launch in October." },
      { startMs: 62_500, endMs: 70_000, text: "Ana will prepare the posters." },
    ],
  },
};

let editor: Editor | null = null;

function mount() {
  editor = new Editor({
    extensions: editorExtensions,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Sync" }] },
        recording,
      ],
    },
  });
  render(<EditorContent editor={editor} />);
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("formatTimestamp", () => {
  it.each([
    [0, "0:00"],
    [62_500, "1:02"],
    [3_725_000, "1:02:05"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatTimestamp(ms)).toBe(text);
  });
});

describe("VoiceRecording node", () => {
  it("puts the transcript in the note's searchable text", () => {
    const instance = mount();

    expect(instance.getText({ blockSeparator: "\n" })).toBe(
      "Sync\nWe decided to launch in October. Ana will prepare the posters.",
    );
  });

  it("round-trips its attributes through the Tiptap JSON", () => {
    const instance = mount();

    expect(instance.getJSON().content?.[1]).toEqual(recording);
  });

  it("plays from the moment a sentence was spoken", async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const user = userEvent.setup();
    mount();

    const sentence = await screen.findByRole("button", {
      name: /Ana will prepare the posters/,
    });
    await waitFor(() => expect(sentence).toBeEnabled());
    await user.click(sentence);

    const audio = document.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe(
      "asset://localhost/Users/me/Library/Application Support/com.nodi.app/attachments/ab/abcdef/recording.wav",
    );
    expect(audio?.currentTime).toBe(62.5);
    expect(play).toHaveBeenCalledOnce();
    play.mockRestore();
  });

  it("lists the transcript with its timestamps", async () => {
    mount();

    const transcript = await screen.findByRole("list", { name: "Transcrição" });
    expect(transcript).toHaveTextContent(
      "0:00We decided to launch in October.",
    );
    expect(transcript).toHaveTextContent("1:02Ana will prepare the posters.");
  });
});

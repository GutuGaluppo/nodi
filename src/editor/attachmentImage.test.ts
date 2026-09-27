import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initAttachmentUrls } from "../lib/attachments/attachmentUrl";
import { editorExtensions } from "./editorExtensions";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost${path}`,
}));
vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: async () => "/Users/me/Library/Application Support/com.nodi.app/",
}));

const image = {
  type: "image",
  attrs: {
    src: null,
    alt: "",
    title: null,
    width: null,
    height: null,
    path: "attachments/ab/abcdef/image.png",
    attachmentId: "a1",
  },
};

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("AttachmentImage", () => {
  it("shows a stored image through the asset protocol but saves only its path", async () => {
    await initAttachmentUrls();
    editor = new Editor({
      extensions: editorExtensions,
      content: { type: "doc", content: [image] },
    });

    expect(editor.getHTML()).toContain(
      'src="asset://localhost/Users/me/Library/Application Support/com.nodi.app/attachments/ab/abcdef/image.png"',
    );
    const saved = editor.getJSON().content?.[0];
    expect(saved?.attrs?.path).toBe("attachments/ab/abcdef/image.png");
    expect(saved?.attrs?.src).toBeNull();
  });

  it("keeps ordinary image URLs working", () => {
    editor = new Editor({
      extensions: editorExtensions,
      content: {
        type: "doc",
        content: [
          { type: "image", attrs: { src: "data:image/png;base64,AA==" } },
        ],
      },
    });

    expect(editor.getHTML()).toContain('src="data:image/png;base64,AA=="');
  });
});

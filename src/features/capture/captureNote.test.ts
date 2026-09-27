import { describe, expect, it } from "vitest";
import { captureToNote } from "./captureNote";

describe("captureToNote", () => {
  it("keeps the title, splits text into paragraphs, and links the source", () => {
    const note = captureToNote({
      title: "Tauri plugins",
      text: "Plugins are crates.\nThey add commands.\n\nPermissions stay explicit.",
      url: "https://tauri.app/plugin/",
    });

    expect(note.title).toBe("Tauri plugins");
    expect(JSON.parse(note.contentJson ?? "")).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Plugins are crates." },
            { type: "hardBreak" },
            { type: "text", text: "They add commands." },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Permissions stay explicit." }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "https://tauri.app/plugin/",
              marks: [
                { type: "link", attrs: { href: "https://tauri.app/plugin/" } },
              ],
            },
          ],
        },
      ],
    });
    expect(note.contentText).toBe(
      "Plugins are crates.\nThey add commands.\n\nPermissions stay explicit.\nhttps://tauri.app/plugin/",
    );
  });

  it("names a shared link after its host when no title is given", () => {
    expect(
      captureToNote({ title: "", text: "", url: "https://www.apple.com/mac" })
        .title,
    ).toBe("www.apple.com");
  });

  it("creates an empty paragraph when nothing but a title arrives", () => {
    expect(
      JSON.parse(
        captureToNote({ title: "Idea", text: "", url: null }).contentJson ?? "",
      ),
    ).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

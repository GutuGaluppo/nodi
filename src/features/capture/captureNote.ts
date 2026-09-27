import type { CreateNoteInput } from "../../db/repositories/noteRepository";

/** Something sent to NODI from outside: the Share menu, Shortcuts, a link. */
export interface Capture {
  title: string;
  text: string;
  url: string | null;
}

interface TextNode {
  type: "text";
  text: string;
  marks?: { type: "link"; attrs: { href: string } }[];
}

/**
 * Turns a capture into a new note: the title as given (or the link's host),
 * one paragraph per block of text, and the source link at the end.
 */
export function captureToNote(capture: Capture): CreateNoteInput {
  const paragraphs = capture.text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => ({
      type: "paragraph",
      content: block
        .split("\n")
        .flatMap((line, index) =>
          index === 0
            ? [{ type: "text", text: line } as TextNode]
            : [{ type: "hardBreak" }, { type: "text", text: line } as TextNode],
        ),
    }));
  if (capture.url) {
    paragraphs.push({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: capture.url,
          marks: [{ type: "link", attrs: { href: capture.url } }],
        },
      ],
    });
  }
  let title = capture.title.trim();
  if (title === "" && capture.url) {
    try {
      title = new URL(capture.url).hostname;
    } catch {
      title = "";
    }
  }
  const contentText = [capture.text.trim(), capture.url ?? ""]
    .filter((part) => part !== "")
    .join("\n");
  return {
    title,
    contentJson: JSON.stringify({
      type: "doc",
      content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }],
    }),
    contentText,
  };
}

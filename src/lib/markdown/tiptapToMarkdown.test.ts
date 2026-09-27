import { describe, expect, it } from "vitest";
import {
  noteToMarkdown,
  type TiptapNode,
  tiptapToMarkdown,
} from "./tiptapToMarkdown";

const text = (value: string, marks?: string[]): TiptapNode => ({
  type: "text",
  text: value,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});
const p = (...content: TiptapNode[]): TiptapNode => ({
  type: "paragraph",
  content,
});
const doc = (...content: TiptapNode[]): TiptapNode => ({
  type: "doc",
  content,
});

describe("tiptapToMarkdown", () => {
  it("renders headings, paragraphs, and inline marks", () => {
    expect(
      tiptapToMarkdown(
        doc(
          { type: "heading", attrs: { level: 2 }, content: [text("Plan")] },
          p(
            text("Ship "),
            text("today ", ["bold"]),
            text("carefully", ["italic"]),
            text(", "),
            text("npm run", ["code"]),
            text(" and "),
            text("old", ["strike"]),
          ),
        ),
      ),
    ).toBe("## Plan\n\nShip **today** *carefully*, `npm run` and ~~old~~\n");
  });

  it("renders links, highlights, and underline", () => {
    expect(
      tiptapToMarkdown(
        doc(
          p(
            {
              type: "text",
              text: "docs",
              marks: [{ type: "link", attrs: { href: "https://tauri.app" } }],
            },
            text(" "),
            text("key", ["highlight"]),
            text(" "),
            text("under", ["underline"]),
          ),
        ),
      ),
    ).toBe("[docs](https://tauri.app) ==key== <u>under</u>\n");
  });

  it("renders bullet, numbered, and nested task lists", () => {
    expect(
      tiptapToMarkdown(
        doc(
          {
            type: "bulletList",
            content: [
              { type: "listItem", content: [p(text("milk"))] },
              {
                type: "listItem",
                content: [
                  p(text("bread")),
                  {
                    type: "orderedList",
                    attrs: { start: 1 },
                    content: [
                      { type: "listItem", content: [p(text("sourdough"))] },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: true },
                content: [p(text("Freeze schema"))],
              },
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [p(text("Record walkthrough"))],
              },
            ],
          },
        ),
      ),
    ).toBe(
      "- milk\n- bread\n  1. sourdough\n\n- [x] Freeze schema\n- [ ] Record walkthrough\n",
    );
  });

  it("renders tables as GitHub tables", () => {
    const cell = (type: string, value: string): TiptapNode => ({
      type,
      content: [p(text(value))],
    });
    expect(
      tiptapToMarkdown(
        doc({
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                cell("tableHeader", "Week"),
                cell("tableHeader", "Focus"),
              ],
            },
            {
              type: "tableRow",
              content: [cell("tableCell", "38"), cell("tableCell", "A | B")],
            },
          ],
        }),
      ),
    ).toBe("| Week | Focus |\n| --- | --- |\n| 38 | A \\| B |\n");
  });

  it("renders quotes, code blocks, and rules", () => {
    expect(
      tiptapToMarkdown(
        doc(
          { type: "blockquote", content: [p(text("Quiet tools"))] },
          {
            type: "codeBlock",
            attrs: { language: "ts" },
            content: [text("const x = 1;")],
          },
          { type: "horizontalRule" },
        ),
      ),
    ).toBe("> Quiet tools\n\n```ts\nconst x = 1;\n```\n\n---\n");
  });

  it("renders a kept recording with its timed transcript", () => {
    expect(
      tiptapToMarkdown(
        doc({
          type: "voiceRecording",
          attrs: {
            src: "attachments/ab/abc/recording.wav",
            durationMs: 75_000,
            segments: [
              { startMs: 0, endMs: 4_000, text: "Ship in October." },
              { startMs: 62_500, endMs: 70_000, text: "Ana makes posters." },
            ],
          },
        }),
      ),
    ).toBe(
      "> **Recording** (1:15) · `attachments/ab/abc/recording.wav`\n>\n> 0:00 Ship in October.\n> 1:02 Ana makes posters.\n",
    );
  });

  it("escapes text that would become Markdown syntax", () => {
    expect(tiptapToMarkdown(doc(p(text("# not a heading *or* [link]"))))).toBe(
      "\\# not a heading \\*or\\* \\[link\\]\n",
    );
  });

  it("returns an empty string for an empty document", () => {
    expect(tiptapToMarkdown(doc(p()))).toBe("");
  });
});

describe("noteToMarkdown", () => {
  it("writes front matter, the title, and the body", () => {
    expect(
      noteToMarkdown(
        {
          id: "n-1",
          title: 'Launch "v1"',
          notebook: "Product",
          tags: ["roadmap", "urgent"],
          createdAt: "2026-09-01T10:00:00.000Z",
          updatedAt: "2026-09-27T10:00:00.000Z",
        },
        JSON.stringify(doc(p(text("Everything stays on this Mac.")))),
      ),
    ).toBe(
      [
        "---",
        'id: "n-1"',
        'title: "Launch \\"v1\\""',
        'notebook: "Product"',
        'tags: ["roadmap", "urgent"]',
        "created: 2026-09-01T10:00:00.000Z",
        "updated: 2026-09-27T10:00:00.000Z",
        "---",
        "",
        '# Launch "v1"',
        "",
        "Everything stays on this Mac.",
        "",
      ].join("\n"),
    );
  });

  it("names untitled notes and survives broken content", () => {
    expect(
      noteToMarkdown(
        {
          id: "n-2",
          title: "",
          notebook: null,
          tags: [],
          createdAt: "c",
          updatedAt: "u",
        },
        "not json",
      ),
    ).toBe(
      '---\nid: "n-2"\ntitle: ""\ntags: []\ncreated: c\nupdated: u\n---\n\n# Untitled\n',
    );
  });
});

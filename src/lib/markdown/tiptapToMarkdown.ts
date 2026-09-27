/**
 * Converts NODI's Tiptap JSON (the canonical note content) to CommonMark with
 * the GitHub extensions people expect: task lists, tables, strikethrough.
 * Pure and dependency-free, so export (EXPORT-001) and the Markdown mirror
 * (MIRROR-001) produce exactly the same text.
 */

export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

interface Segment {
  startMs: number;
  endMs: number;
  text: string;
}

function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = (total % 60).toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** Escapes characters that would otherwise start Markdown syntax. */
function escapeText(text: string): string {
  return text
    .replace(/([\\`*_[\]<>|~])/g, "\\$1")
    .replace(/^([#>+-]|\d+\.)(\s)/, "\\$1$2");
}

function wrapMark(text: string, mark: TiptapMark): string {
  switch (mark.type) {
    case "bold":
      return `**${text}**`;
    case "italic":
      return `*${text}*`;
    case "strike":
      return `~~${text}~~`;
    case "underline":
      return `<u>${text}</u>`;
    case "highlight":
      return `==${text}==`;
    case "link": {
      const href = String(mark.attrs?.href ?? "");
      return href
        ? `[${text}](${href.replace(/[()\s]/g, encodeURIComponent)})`
        : text;
    }
    default:
      return text;
  }
}

function renderText(node: TiptapNode): string {
  const raw = node.text ?? "";
  const marks = node.marks ?? [];
  if (marks.some((mark) => mark.type === "code")) {
    const fence = raw.includes("`") ? "``" : "`";
    const code = `${fence}${raw}${fence}`;
    return marks
      .filter((mark) => mark.type === "link")
      .reduce((text, mark) => wrapMark(text, mark), code);
  }
  // Keep surrounding spaces outside the markers so "**bold **" never happens.
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.slice(leading.length).match(/\s*$/)?.[0] ?? "";
  const core = raw.slice(leading.length, raw.length - trailing.length);
  if (core === "") return raw;
  const order = ["link", "highlight", "underline", "strike", "italic", "bold"];
  const wrapped = [...marks]
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
    .reduce((text, mark) => wrapMark(text, mark), escapeText(core));
  return `${leading}${wrapped}${trailing}`;
}

function renderInline(nodes: TiptapNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return renderText(node);
      if (node.type === "hardBreak") return "\\\n";
      if (node.type === "image") return renderImage(node);
      return renderInline(node.content);
    })
    .join("");
}

function renderImage(node: TiptapNode): string {
  const src = String(node.attrs?.src ?? "");
  const alt = String(node.attrs?.alt ?? "").replace(/[[\]]/g, "");
  return src ? `![${alt}](${src})` : "";
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line, index) =>
      index === 0 || line === "" ? line : `${prefix}${line}`,
    )
    .join("\n");
}

function renderListItem(node: TiptapNode, marker: string): string {
  const pad = " ".repeat(marker.length);
  const body = (node.content ?? [])
    .map((child) => renderBlock(child))
    .filter((block) => block !== "")
    .join("\n");
  return `${marker}${indent(body, pad)}`;
}

function renderTable(node: TiptapNode): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      (cell.content ?? [])
        .map((block) => renderInline(block.content))
        .join(" ")
        // Pipes are already escaped with the rest of the text.
        .replace(/\n/g, " ")
        .trim(),
    ),
  );
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const pad = (row: string[]) => [
    ...row,
    ...Array(width - row.length).fill(""),
  ];
  const line = (row: string[]) => `| ${pad(row).join(" | ")} |`;
  const [header, ...body] = rows;
  return [
    line(header),
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...body.map(line),
  ].join("\n");
}

function renderVoiceRecording(node: TiptapNode): string {
  const segments = (node.attrs?.segments as Segment[] | undefined) ?? [];
  const duration = formatTimestamp(Number(node.attrs?.durationMs ?? 0));
  const src = node.attrs?.src ? String(node.attrs.src) : "";
  const heading = src
    ? `> **Recording** (${duration}) · \`${src}\``
    : `> **Recording** (${duration})`;
  const lines = segments.map(
    (segment) =>
      `> ${formatTimestamp(segment.startMs)} ${escapeText(segment.text)}`,
  );
  return [heading, ...(lines.length > 0 ? [">", ...lines] : [])].join("\n");
}

function renderBlock(node: TiptapNode): string {
  switch (node.type) {
    case "paragraph":
      return renderInline(node.content);
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return `${"#".repeat(level)} ${renderInline(node.content)}`;
    }
    case "bulletList":
      return (node.content ?? [])
        .map((item) => renderListItem(item, "- "))
        .join("\n");
    case "orderedList": {
      const start = Number(node.attrs?.start ?? 1);
      return (node.content ?? [])
        .map((item, index) => renderListItem(item, `${start + index}. `))
        .join("\n");
    }
    case "taskList":
      return (node.content ?? [])
        .map((item) =>
          renderListItem(item, item.attrs?.checked ? "- [x] " : "- [ ] "),
        )
        .join("\n");
    case "blockquote":
      return (node.content ?? [])
        .map(renderBlock)
        .join("\n\n")
        .split("\n")
        .map((line) => (line === "" ? ">" : `> ${line}`))
        .join("\n");
    case "codeBlock": {
      const code = (node.content ?? [])
        .map((child) => child.text ?? "")
        .join("");
      const fence = code.includes("```") ? "````" : "```";
      return `${fence}${String(node.attrs?.language ?? "")}\n${code}\n${fence}`;
    }
    case "horizontalRule":
      return "---";
    case "image":
      return renderImage(node);
    case "table":
      return renderTable(node);
    case "voiceRecording":
      return renderVoiceRecording(node);
    default:
      return node.content
        ? node.content.map(renderBlock).join("\n\n")
        : renderInline([node]);
  }
}

/** Converts a Tiptap document to Markdown, ending with one newline. */
export function tiptapToMarkdown(doc: TiptapNode): string {
  const blocks = (doc.content ?? [])
    .map(renderBlock)
    .filter((block) => block.trim() !== "");
  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
}

export interface MarkdownNoteMeta {
  id: string;
  title: string;
  notebook: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

/** A full Markdown file for one note: YAML front matter, title, and body. */
export function noteToMarkdown(
  meta: MarkdownNoteMeta,
  contentJson: string,
): string {
  let doc: TiptapNode;
  try {
    doc = JSON.parse(contentJson) as TiptapNode;
  } catch {
    doc = { type: "doc", content: [] };
  }
  const front = [
    "---",
    `id: ${yamlString(meta.id)}`,
    `title: ${yamlString(meta.title)}`,
    ...(meta.notebook ? [`notebook: ${yamlString(meta.notebook)}`] : []),
    `tags: [${meta.tags.map(yamlString).join(", ")}]`,
    `created: ${meta.createdAt}`,
    `updated: ${meta.updatedAt}`,
    "---",
  ].join("\n");
  const title = meta.title.trim() === "" ? "Untitled" : meta.title.trim();
  const body = tiptapToMarkdown(doc);
  return `${front}\n\n# ${escapeText(title)}\n${body === "" ? "" : `\n${body}`}`;
}

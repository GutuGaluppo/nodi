import type { ExportableNote } from "../../db/repositories/exportRepository";
import { noteToMarkdown } from "../../lib/markdown/tiptapToMarkdown";

export interface MirrorFile {
  path: string;
  content: string;
}

const MAX_NAME_LENGTH = 120;

/** Turns a title or notebook name into a safe file or folder name. */
export function toFileName(name: string, fallback: string): string {
  const cleaned = Array.from(name, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? "-" : character;
  })
    .join("")
    // Separators and characters macOS, Windows, or Git choke on.
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[.\s]+$/, "")
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned === "" ? fallback : cleaned;
}

/**
 * Lays notes out as `<Notebook>/<Title>.md`, with notes outside a notebook at
 * the top level. Titles that collide get " (2)", " (3)"… in creation order,
 * so each note keeps the same file between runs.
 */
export function buildMirrorFiles(notes: ExportableNote[]): MirrorFile[] {
  const used = new Set<string>();
  return notes.map((note) => {
    const folder = note.notebook ? toFileName(note.notebook, "Notebook") : null;
    const base = toFileName(note.title, "Untitled");
    let name = base;
    let copy = 2;
    const pathFor = (fileName: string) =>
      folder ? `${folder}/${fileName}.md` : `${fileName}.md`;
    while (used.has(pathFor(name).toLowerCase())) {
      name = `${base} (${copy})`;
      copy += 1;
    }
    const path = pathFor(name);
    used.add(path.toLowerCase());
    return {
      path,
      content: noteToMarkdown(
        {
          id: note.id,
          title: note.title,
          notebook: note.notebook,
          tags: note.tags,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        },
        note.contentJson,
      ),
    };
  });
}

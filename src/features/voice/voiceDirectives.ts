import {
  parseVoiceCommand,
  type VoiceInsertionPlan,
} from "./voiceCommandParser";

/**
 * Organizing directives spoken with a dictation, in Portuguese or English:
 *
 *   "Título: Reunião de sexta. Decidimos lançar em outubro."
 *   "Crie uma lista de compras no caderno Casa com a tag mercado: leite e pão"
 *   "In notebook Work with tags launch and urgent: call the printer"
 *
 * A title is recognized at the very start. Notebook and tag directives are
 * recognized in the part of the dictation before the first colon, so ordinary
 * sentences that happen to mention a notebook are left alone. Like the list
 * parser, this is a fixed grammar, not an LLM.
 */
export interface VoiceOrganization {
  title?: string;
  notebook?: string;
  tags: string[];
  reminder?: string;
}

export interface VoiceDictation {
  plan: VoiceInsertionPlan;
  organize: VoiceOrganization;
}

const TITLE_PATTERN =
  /^(?:t[íi]tulo|title)\s*[:,-]?\s*([^.!?\n]+)[.!?\n]?\s*/iu;

const NOTEBOOK_KEYWORDS =
  "(?:(?:no|na|para o|pro|ao)\\s+caderno|(?:in|into|to)(?:\\s+the)?\\s+notebook)";
const TAG_KEYWORDS =
  "(?:com\\s+(?:a\\s+|as\\s+)?tags?|with\\s+(?:the\\s+)?tags?|tagged(?:\\s+as)?)";

const NOTEBOOK_PATTERN = new RegExp(
  `(?:^|\\s|,)${NOTEBOOK_KEYWORDS}\\s+(.+?)(?=\\s*,?\\s*(?:(?:e|and)\\s+)?${TAG_KEYWORDS}(?:\\s|$)|$)`,
  "iu",
);
const TAG_PATTERN = new RegExp(
  `(?:^|\\s|,)${TAG_KEYWORDS}\\s+(.+?)(?=\\s*,?\\s*(?:(?:e|and)\\s+)?${NOTEBOOK_KEYWORDS}(?:\\s|$)|$)`,
  "iu",
);
const TAG_SEPARATOR = /\s*,\s*|\s+e\s+|\s+and\s+/iu;

function cleanName(value: string): string {
  return value
    .trim()
    .replace(/^#/, "")
    .replace(/[\s.,;!?]+$/u, "")
    .trim();
}

function removeSpan(text: string, match: RegExpExecArray): string {
  return `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
}

/** Takes notebook and tag directives out of a header; returns what remains. */
function extractDirectives(header: string): {
  rest: string;
  notebook?: string;
  tags: string[];
} {
  let rest = header;
  let notebook: string | undefined;
  let tags: string[] = [];

  const notebookMatch = NOTEBOOK_PATTERN.exec(rest);
  if (notebookMatch) {
    notebook = cleanName(notebookMatch[1]) || undefined;
    rest = removeSpan(rest, notebookMatch);
  }
  const tagMatch = TAG_PATTERN.exec(rest);
  if (tagMatch) {
    tags = tagMatch[1]
      .split(TAG_SEPARATOR)
      .map(cleanName)
      .filter((tag) => tag.length > 0);
    rest = removeSpan(rest, tagMatch);
  }

  rest = rest
    .replace(/\s+/g, " ")
    .replace(/[\s,]+(?:e|and)?\s*$/iu, "")
    .trim();
  return { rest, notebook, tags };
}

export function parseVoiceDictation(rawText: string): VoiceDictation {
  const organize: VoiceOrganization = { tags: [] };
  let text = rawText.trim();

  const titleMatch = TITLE_PATTERN.exec(text);
  if (titleMatch) {
    organize.title = cleanName(titleMatch[1]);
    text = text.slice(titleMatch[0].length).trim();
  }

  const colon = text.indexOf(":");
  if (colon !== -1) {
    const header = text.slice(0, colon);
    const body = text.slice(colon + 1).trim();
    const { rest, notebook, tags } = extractDirectives(header);
    if (notebook !== undefined || tags.length > 0) {
      organize.notebook = notebook;
      organize.tags = tags;
      text = rest === "" ? body : `${rest}: ${body}`;
    }
  }

  const plan =
    text === ""
      ? ({ kind: "text", text: "" } as const)
      : parseVoiceCommand(text);
  return { plan, organize };
}

/** Lowercases and strips accents so "Café" matches a spoken "cafe". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

interface Named {
  id: string;
  name: string;
}

export interface ResolvedTarget {
  /** The existing record, when the spoken name matches one. */
  id?: string;
  name: string;
}

/**
 * Matches a spoken name against existing records, ignoring case and accents.
 * A spoken phrase can run past the real name ("Casa hoje" for "Casa"), so the
 * longest existing name that starts the phrase wins.
 */
export function resolveName(spoken: string, existing: Named[]): ResolvedTarget {
  const phrase = normalizeName(spoken);
  const exact = existing.find((item) => normalizeName(item.name) === phrase);
  if (exact) return { id: exact.id, name: exact.name };

  const prefix = existing
    .filter((item) => {
      const name = normalizeName(item.name);
      return name.length > 0 && phrase.startsWith(`${name} `);
    })
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (prefix) return { id: prefix.id, name: prefix.name };

  return { name: spoken };
}

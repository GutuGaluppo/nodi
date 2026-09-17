export type VoiceListType = "bullet" | "task";

export type VoiceInsertionPlan =
  | { kind: "text"; text: string }
  | { kind: "list"; listType: VoiceListType; items: string[] };

interface TriggerMatch {
  remainder: string;
  listType: VoiceListType;
}

// Heuristic, not an LLM: a fixed set of trigger phrases recognized at the
// start of the dictation, PT and EN, verb-led ("crie uma lista de compras")
// or bare ("lista de compras:"). Anything not matching one of these is
// treated as plain dictation — see docs/VOICE_TRANSCRIPTION_APPROACH.md's
// non-goals and the follow-up discussion on why this stops short of an LLM.
const PT_VERB_TRIGGER =
  /^(?:crie|construa|monte|fa[çc]a|come[çc]e|adicione)\s+uma\s+lista(?:\s+(?:de|para)\s+([a-zà-ü]+))?\s*[:,.]?\s*/iu;

const PT_BARE_TRIGGER = /^lista(?:\s+(?:de|para)\s+([a-zà-ü]+))?\s*[:,.]\s*/iu;

const EN_VERB_TRIGGER =
  /^(?:create|build|make|start)\s+a\s+(?:shopping\s+|to-?do\s+)?list(?:\s+of\s+(\w+))?\s*[:,.]?\s*/i;

const EN_BARE_TRIGGER = /^(?:shopping\s+|to-?do\s+)?list\s*[:,.]\s*/i;

const TASK_KEYWORDS = ["tarefa", "afazer", "fazer", "to-do", "todo", "task"];

// Splits on commas, semicolons, newlines, and the standalone conjunction
// ("e"/"and") people naturally use before the last item in a spoken list —
// e.g. "leite, pão, ovos e café".
const ITEM_SEPARATOR = /\s*,\s*|\s*;\s*|\n+|\s+e\s+|\s+and\s+/iu;

function classifyListType(matchedText: string): VoiceListType {
  const normalized = matchedText.toLowerCase();
  return TASK_KEYWORDS.some((keyword) => normalized.includes(keyword))
    ? "task"
    : "bullet";
}

function matchTrigger(text: string): TriggerMatch | null {
  for (const pattern of [
    PT_VERB_TRIGGER,
    PT_BARE_TRIGGER,
    EN_VERB_TRIGGER,
    EN_BARE_TRIGGER,
  ]) {
    const match = pattern.exec(text);
    if (match !== null) {
      return {
        remainder: text.slice(match[0].length),
        listType: classifyListType(match[0]),
      };
    }
  }
  return null;
}

function splitIntoItems(remainder: string): string[] {
  return remainder
    .split(ITEM_SEPARATOR)
    .map((item) => item.trim().replace(/[.\s]+$/, ""))
    .filter((item) => item.length > 0);
}

/**
 * Decides whether a transcribed dictation is a list-building command
 * ("Construa uma lista de compras: leite, pão e ovos") or plain dictation to
 * insert as-is. Pure text logic, no Tiptap/DOM dependency, so it's testable
 * on its own.
 */
export function parseVoiceCommand(rawText: string): VoiceInsertionPlan {
  const text = rawText.trim();
  const trigger = matchTrigger(text);
  if (trigger === null) {
    return { kind: "text", text: rawText };
  }

  const items = splitIntoItems(trigger.remainder);
  if (items.length === 0) {
    return { kind: "text", text: rawText };
  }

  return { kind: "list", listType: trigger.listType, items };
}

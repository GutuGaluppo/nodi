/**
 * Spoken reminder phrases in Portuguese and English:
 *
 *   "lembrete amanhã às 10"          "remind me tomorrow at 3pm"
 *   "lembre-me sexta às 15h30"       "reminder on Friday at 9:15"
 *   "lembrete em 2 horas"            "remind me in 30 minutes"
 *   "lembrete às 4 da tarde"         "reminder at noon"
 *
 * Rules, kept deliberately small and predictable:
 * - A day without a time means 9:00.
 * - A time without a day means today, or tomorrow when it already passed.
 * - A weekday means its next occurrence; today's weekday counts only when the
 *   time is still ahead.
 * - An hour from 1 to 7 without "am", "da manhã", or minutes past 12h means
 *   the afternoon ("às 3" → 15:00), because nobody sets a reminder for 3 a.m.
 *   by saying "às 3". The preview shows the exact time before anything is set.
 * - A phrase that resolves to the past is not treated as a reminder.
 */

const KEYWORD = "(?:lembrete|lembre-me|me lembre|remind me|reminder)";
const CONNECTOR = "(?:\\s+(?:para|pra|on|for))?";
const WEEKDAY =
  "(?<weekday>segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:-feira|\\s+feira)?";
const DAY = `(?<day>depois\\s+de\\s+amanh[ãa]|(?:the\\s+)?day\\s+after\\s+tomorrow|hoje|amanh[ãa]|today|tomorrow|(?:(?:na|no|nesta|neste|on|this|next)\\s+)?${WEEKDAY})`;
const CLOCK =
  "(?:(?:[àa]s?|at|ao|by)\\s+)?(?:(?<noon>meio[-\\s]dia|noon|midday)|(?<hour>\\d{1,2})(?:(?::|h|\\.)(?<minute>\\d{2}))?(?:\\s*(?<suffix>h(?:oras?)?\\b|am\\b|pm\\b|a\\.m\\.|p\\.m\\.))?(?:\\s+(?<period>da\\s+manh[ãa]|da\\s+tarde|da\\s+noite|in\\s+the\\s+morning|in\\s+the\\s+afternoon|in\\s+the\\s+evening|at\\s+night))?)";
const RELATIVE =
  "(?:em|daqui\\s+a|in)\\s+(?<amount>\\d{1,3}|um|uma|one|an?)\\s+(?<unit>minutos?|horas?|dias?|minutes?|hours?|days?)";

const PHRASE = `${KEYWORD}${CONNECTOR}\\s+(?:${RELATIVE}|(?:${DAY})?(?:\\s*,?\\s*${CLOCK})?)`;

export const REMINDER_PATTERN = new RegExp(PHRASE, "iu");
const LEADING_REMINDER_PATTERN = new RegExp(`^${PHRASE}`, "iu");

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  sunday: 0,
  segunda: 1,
  monday: 1,
  terca: 2,
  tuesday: 2,
  quarta: 3,
  wednesday: 3,
  quinta: 4,
  thursday: 4,
  sexta: 5,
  friday: 5,
  sabado: 6,
  saturday: 6,
};

function plain(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toAmount(value: string): number {
  const word = plain(value);
  if (["um", "uma", "one", "a", "an"].includes(word)) return 1;
  return Number.parseInt(word, 10);
}

function resolveHour(groups: Record<string, string | undefined>): {
  hours: number;
  minutes: number;
} | null {
  if (groups.noon) return { hours: 12, minutes: 0 };
  if (!groups.hour) return null;
  let hours = Number.parseInt(groups.hour, 10);
  const minutes = groups.minute ? Number.parseInt(groups.minute, 10) : 0;
  const suffix = plain(groups.suffix ?? "").replace(/\./g, "");
  const period = plain(groups.period ?? "");
  const morning = suffix === "am" || /manha|morning/.test(period);
  const evening =
    suffix === "pm" || /tarde|noite|afternoon|evening|night/.test(period);

  if (evening && hours < 12) hours += 12;
  if (morning && hours === 12) hours = 0;
  if (!morning && !evening && hours >= 1 && hours <= 7) hours += 12;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function daysUntil(
  groups: Record<string, string | undefined>,
  now: Date,
): {
  offset: number;
  weekday: boolean;
} | null {
  if (!groups.day) return null;
  if (groups.weekday) {
    const target = WEEKDAYS[plain(groups.weekday)];
    return { offset: (target - now.getDay() + 7) % 7, weekday: true };
  }
  const day = plain(groups.day);
  if (day === "hoje" || day === "today") return { offset: 0, weekday: false };
  if (day === "amanha" || day === "tomorrow")
    return { offset: 1, weekday: false };
  return { offset: 2, weekday: false };
}

/** Turns the groups of a matched phrase into a date, or null when it has none. */
function resolveMatch(match: RegExpExecArray, now: Date): Date | null {
  const groups = match.groups ?? {};

  if (groups.amount && groups.unit) {
    const amount = toAmount(groups.amount);
    const unit = plain(groups.unit);
    const minutes = unit.startsWith("min")
      ? amount
      : unit.startsWith("hor") || unit.startsWith("hour")
        ? amount * 60
        : amount * 1440;
    return new Date(now.getTime() + minutes * 60_000);
  }

  const day = daysUntil(groups, now);
  const time = resolveHour(groups);
  if (day === null && time === null) return null;

  const date = new Date(now);
  date.setSeconds(0, 0);
  date.setHours(time?.hours ?? 9, time?.minutes ?? 0);
  date.setDate(date.getDate() + (day?.offset ?? 0));

  if (date.getTime() <= now.getTime()) {
    if (day === null) date.setDate(date.getDate() + 1);
    else if (day.weekday && day.offset === 0) date.setDate(date.getDate() + 7);
    else return null;
  }
  return date;
}

export interface SpokenReminder {
  at: Date;
  index: number;
  length: number;
}

/** Finds a reminder phrase anywhere in `text`. */
export function findSpokenReminder(
  text: string,
  now: Date,
): SpokenReminder | null {
  const match = REMINDER_PATTERN.exec(text);
  if (!match) return null;
  const at = resolveMatch(match, now);
  return at ? { at, index: match.index, length: match[0].length } : null;
}

/** Finds a reminder phrase only at the very start of `text`. */
export function findLeadingSpokenReminder(
  text: string,
  now: Date,
): SpokenReminder | null {
  const match = LEADING_REMINDER_PATTERN.exec(text);
  if (!match) return null;
  const at = resolveMatch(match, now);
  return at ? { at, index: 0, length: match[0].length } : null;
}

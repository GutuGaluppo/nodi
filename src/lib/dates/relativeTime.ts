const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A compact, human timestamp for note lists and save status.
 *
 * Progression: "just now" → "5 min ago" → "3 hr ago" → "Yesterday" →
 * "4 days ago" → a locale date ("Mar 4", or "Mar 4, 2025" outside this year).
 * Elapsed-time buckets are timezone-independent; only the final locale date
 * depends on the reader's timezone, which is the desired behaviour.
 */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso);
  const elapsed = now.getTime() - then.getTime();

  if (Number.isNaN(elapsed)) {
    return "";
  }

  if (elapsed < 45 * SECOND) {
    return "just now";
  }

  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`;
  }

  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} hr ago`;
  }

  if (elapsed < 2 * DAY) {
    return "Yesterday";
  }

  if (elapsed < 7 * DAY) {
    return `${Math.floor(elapsed / DAY)} days ago`;
  }

  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

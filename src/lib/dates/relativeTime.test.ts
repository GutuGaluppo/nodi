import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./relativeTime";

const now = new Date("2026-06-15T12:00:00.000Z");

function localeDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

describe("formatRelativeTime", () => {
  it("says 'just now' within the first 45 seconds", () => {
    expect(formatRelativeTime("2026-06-15T11:59:30.000Z", now)).toBe(
      "just now",
    );
  });

  it("counts whole minutes", () => {
    expect(formatRelativeTime("2026-06-15T11:45:00.000Z", now)).toBe(
      "15 min ago",
    );
  });

  it("counts whole hours", () => {
    expect(formatRelativeTime("2026-06-15T09:00:00.000Z", now)).toBe(
      "3 hr ago",
    );
  });

  it("names yesterday", () => {
    expect(formatRelativeTime("2026-06-14T09:00:00.000Z", now)).toBe(
      "Yesterday",
    );
  });

  it("counts days within the past week", () => {
    expect(formatRelativeTime("2026-06-11T12:00:00.000Z", now)).toBe(
      "4 days ago",
    );
  });

  it("falls back to a locale date beyond a week", () => {
    const result = formatRelativeTime("2026-05-01T12:00:00.000Z", now);
    expect(result).toBe(localeDate("2026-05-01T12:00:00.000Z"));
    expect(result).not.toMatch(/ago/);
  });

  it("includes the year for a different year", () => {
    const result = formatRelativeTime("2025-05-01T12:00:00.000Z", now);
    expect(result).toContain("2025");
  });

  it("returns an empty string for an unparseable date", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});

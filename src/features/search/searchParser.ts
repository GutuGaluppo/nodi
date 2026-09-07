import type { SearchFilters } from "../../db/repositories/noteRepository";

export interface ParsedSearch {
  text: string;
  filters: SearchFilters;
}

const FILTER_PATTERN = /\b(tag|notebook|created|updated):("[^"]*"|\S+)/gi;

export function parseSearchInput(input: string): ParsedSearch {
  const filters: SearchFilters = {};
  const text = input
    .replace(FILTER_PATTERN, (_, rawKey: string, rawValue: string) => {
      const key = rawKey.toLowerCase() as keyof SearchFilters;
      const value = rawValue.startsWith('"')
        ? rawValue.slice(1, -1).replace(/""/g, '"')
        : rawValue;
      if (value) filters[key] = value;
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();

  return { text, filters };
}

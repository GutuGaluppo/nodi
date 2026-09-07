import { useQuery } from "@tanstack/react-query";
import { searchNotes } from "../../db/repositories/noteRepository";
import { parseSearchInput } from "./searchParser";

export const searchKeys = {
  all: ["search"] as const,
  query: (query: string) => ["search", query] as const,
};

export function useSearchNotes(query: string) {
  const normalized = query.trim();
  const parsed = parseSearchInput(normalized);
  return useQuery({
    queryKey: searchKeys.query(normalized),
    queryFn: () => searchNotes(parsed.text, parsed.filters),
    enabled: normalized.length > 0,
  });
}

import { useQuery } from "@tanstack/react-query";
import { searchNotes } from "../../db/repositories/noteRepository";

export const searchKeys = {
  all: ["search"] as const,
  query: (query: string) => ["search", query] as const,
};

export function useSearchNotes(query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: searchKeys.query(normalized),
    queryFn: () => searchNotes(normalized),
    enabled: normalized.length > 0,
  });
}

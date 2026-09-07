import { useQuery } from "@tanstack/react-query";
import {
  type ListNotesInput,
  listNotes,
  type NoteSummary,
} from "../../db/repositories/noteRepository";

/** Query keys for note data, so mutations can invalidate precisely. */
export const notesKeys = {
  all: ["notes"] as const,
  list: (input: ListNotesInput = {}) => ["notes", "list", input] as const,
  detail: (id: string) => ["notes", "detail", id] as const,
};

/** Load the note list for the given filter via the note repository. */
export function useNotes(input: ListNotesInput = {}) {
  return useQuery<NoteSummary[]>({
    queryKey: notesKeys.list(input),
    queryFn: () => listNotes(input),
  });
}

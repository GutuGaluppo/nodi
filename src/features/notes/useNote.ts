import { useQuery } from "@tanstack/react-query";
import { getNoteById, type Note } from "../../db/repositories/noteRepository";
import { notesKeys } from "./useNotes";

/** Load one full note (including its Tiptap body) for the editor. */
export function useNote(id: string | null) {
  return useQuery<Note | null>({
    queryKey: notesKeys.detail(id ?? "none"),
    queryFn: () => (id === null ? Promise.resolve(null) : getNoteById(id)),
    enabled: id !== null,
  });
}

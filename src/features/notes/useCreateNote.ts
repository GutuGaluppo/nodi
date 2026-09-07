import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateNoteInput,
  createNote,
  type Note,
} from "../../db/repositories/noteRepository";
import { notesKeys } from "./useNotes";

/**
 * Create a note and refresh every note list. Resolves with the persisted note so
 * the caller can select it and move focus to the editor.
 */
export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation<Note, Error, CreateNoteInput | undefined>({
    mutationFn: (input) => createNote(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

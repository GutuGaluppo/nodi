import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type Note,
  type UpdateNoteInput,
  updateNote,
} from "../../db/repositories/noteRepository";
import { notesKeys } from "./useNotes";

interface UpdateNoteVariables {
  id: string;
  patch: UpdateNoteInput;
}

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation<Note, Error, UpdateNoteVariables>({
    mutationFn: ({ id, patch }) => updateNote(id, patch),
    onSuccess: (note) => {
      queryClient.setQueryData(notesKeys.detail(note.id), note);
      void queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

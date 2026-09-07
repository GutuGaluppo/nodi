import { useMutation, useQueryClient } from "@tanstack/react-query";
import { softDeleteNote } from "../../db/repositories/noteRepository";
import { notesKeys } from "./useNotes";

export function useTrashNote() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => softDeleteNote(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: notesKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

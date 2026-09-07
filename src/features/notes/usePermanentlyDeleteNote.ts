import { useMutation, useQueryClient } from "@tanstack/react-query";
import { permanentlyDeleteNote } from "../../db/repositories/noteRepository";
import { notesKeys } from "./useNotes";

export function usePermanentlyDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => permanentlyDeleteNote(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: notesKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

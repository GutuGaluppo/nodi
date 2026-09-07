import { useMutation, useQueryClient } from "@tanstack/react-query";
import { restoreNote } from "../../db/repositories/noteRepository";
import { notesKeys } from "./useNotes";

export function useRestoreNote() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => restoreNote(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: notesKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

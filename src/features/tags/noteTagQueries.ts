import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addTagToNote,
  listTagsForNote,
  removeTagFromNote,
} from "../../db/repositories/noteTagRepository";
import { notesKeys } from "../notes/useNotes";

export const noteTagKeys = {
  all: ["note-tags"] as const,
  note: (noteId: string) => ["note-tags", noteId] as const,
};

export function useNoteTags(noteId: string) {
  return useQuery({
    queryKey: noteTagKeys.note(noteId),
    queryFn: () => listTagsForNote(noteId),
  });
}

function useChangeNoteTag(
  mutation: (noteId: string, tagId: string) => Promise<void>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, tagId }: { noteId: string; tagId: string }) =>
      mutation(noteId, tagId),
    onSuccess: async (_, variables) => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: noteTagKeys.note(variables.noteId),
        }),
        client.invalidateQueries({ queryKey: notesKeys.all }),
      ]);
    },
  });
}

export function useAddTagToNote() {
  return useChangeNoteTag(addTagToNote);
}

export function useRemoveTagFromNote() {
  return useChangeNoteTag(removeTagFromNote);
}

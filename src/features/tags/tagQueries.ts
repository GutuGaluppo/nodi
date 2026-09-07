import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTag,
  deleteTag,
  listTags,
  renameTag,
} from "../../db/repositories/tagRepository";

export const tagKeys = { all: ["tags"] as const };

export function useTags() {
  return useQuery({ queryKey: tagKeys.all, queryFn: listTags });
}

export function useCreateTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createTag(name),
    onSuccess: async () => client.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useRenameTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameTag(id, name),
    onSuccess: async () => client.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useDeleteTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: async () => client.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

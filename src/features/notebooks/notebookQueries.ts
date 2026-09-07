import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNotebook,
  deleteNotebook,
  listNotebooks,
  renameNotebook,
} from "../../db/repositories/notebookRepository";

export const notebookKeys = {
  all: ["notebooks"] as const,
};

export function useNotebooks() {
  return useQuery({
    queryKey: notebookKeys.all,
    queryFn: listNotebooks,
  });
}

export function useCreateNotebook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createNotebook(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notebookKeys.all });
    },
  });
}

export function useRenameNotebook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameNotebook(id, name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notebookKeys.all });
    },
  });
}

export function useDeleteNotebook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNotebook(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notebookKeys.all });
    },
  });
}

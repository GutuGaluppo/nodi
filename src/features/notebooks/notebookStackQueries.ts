import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { moveNotebookToStack } from "../../db/repositories/notebookRepository";
import {
  createNotebookStack,
  deleteNotebookStack,
  listNotebookStacks,
  renameNotebookStack,
} from "../../db/repositories/notebookStackRepository";
import { notebookKeys } from "./notebookQueries";

export const notebookStackKeys = { all: ["notebook-stacks"] as const };

export function useNotebookStacks() {
  return useQuery({
    queryKey: notebookStackKeys.all,
    queryFn: listNotebookStacks,
  });
}

export function useCreateNotebookStack() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createNotebookStack(name),
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: notebookStackKeys.all }),
  });
}

export function useRenameNotebookStack() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameNotebookStack(id, name),
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: notebookStackKeys.all }),
  });
}

export function useDeleteNotebookStack() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNotebookStack(id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: notebookStackKeys.all }),
        client.invalidateQueries({ queryKey: notebookKeys.all }),
      ]);
    },
  });
}

export function useMoveNotebookToStack() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stackId }: { id: string; stackId: string | null }) =>
      moveNotebookToStack(id, stackId),
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: notebookKeys.all }),
  });
}

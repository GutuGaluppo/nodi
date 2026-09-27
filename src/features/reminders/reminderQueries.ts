import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearReminder,
  getPendingReminder,
  setReminder,
} from "../../db/repositories/reminderRepository";

export const reminderKeys = {
  all: ["reminders"] as const,
  note: (noteId: string) => ["reminders", noteId] as const,
};

export function useReminder(noteId: string) {
  return useQuery({
    queryKey: reminderKeys.note(noteId),
    queryFn: () => getPendingReminder(noteId),
  });
}

export function useSetReminder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, remindAt }: { noteId: string; remindAt: Date }) =>
      setReminder(noteId, remindAt),
    onSuccess: async (_, { noteId }) =>
      client.invalidateQueries({ queryKey: reminderKeys.note(noteId) }),
  });
}

export function useClearReminder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => clearReminder(noteId),
    onSuccess: async (_, noteId) =>
      client.invalidateQueries({ queryKey: reminderKeys.note(noteId) }),
  });
}

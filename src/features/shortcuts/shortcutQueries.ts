import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addShortcut,
  listShortcuts,
  removeShortcut,
  type ShortcutTargetType,
} from "../../db/repositories/shortcutRepository";

export const shortcutKeys = { all: ["shortcuts"] as const };

export function useShortcuts() {
  return useQuery({ queryKey: shortcutKeys.all, queryFn: listShortcuts });
}

export function useToggleShortcut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      targetType,
      targetId,
      active,
    }: {
      targetType: ShortcutTargetType;
      targetId: string;
      active: boolean;
    }) =>
      active
        ? removeShortcut(targetType, targetId)
        : addShortcut(targetType, targetId),
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: shortcutKeys.all }),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
} from "../../db/repositories/savedSearchRepository";

export const savedSearchKeys = { all: ["saved-searches"] as const };

export function useSavedSearches() {
  return useQuery({
    queryKey: savedSearchKeys.all,
    queryFn: listSavedSearches,
  });
}

export function useCreateSavedSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, query }: { name: string; query: string }) =>
      createSavedSearch(name, query),
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: savedSearchKeys.all }),
  });
}

export function useDeleteSavedSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSavedSearch(id),
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: savedSearchKeys.all }),
  });
}

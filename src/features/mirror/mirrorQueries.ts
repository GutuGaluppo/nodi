import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  chooseMirrorFolder,
  getLastMirrorRun,
  getMirrorFolder,
  runMirror,
  stopMirroring,
} from "./markdownMirror";

export const mirrorKeys = {
  folder: ["mirror", "folder"] as const,
  lastRun: ["mirror", "last-run"] as const,
};

/** Marks mirror mutations so they do not schedule another mirror pass. */
export const MIRROR_MUTATION = { mirror: true };

export function useMirrorFolder() {
  return useQuery({ queryKey: mirrorKeys.folder, queryFn: getMirrorFolder });
}

export function useLastMirrorRun() {
  return useQuery({ queryKey: mirrorKeys.lastRun, queryFn: getLastMirrorRun });
}

export function useChooseMirrorFolder() {
  const client = useQueryClient();
  return useMutation({
    meta: MIRROR_MUTATION,
    mutationFn: async () => {
      const folder = await chooseMirrorFolder();
      if (folder !== null) await runMirror(true);
      return folder;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["mirror"] });
    },
  });
}

export function useRebuildMirror() {
  const client = useQueryClient();
  return useMutation({
    meta: MIRROR_MUTATION,
    mutationFn: () => runMirror(true),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: mirrorKeys.lastRun });
    },
  });
}

export function useStopMirroring() {
  const client = useQueryClient();
  return useMutation({
    meta: MIRROR_MUTATION,
    mutationFn: stopMirroring,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: mirrorKeys.folder });
    },
  });
}

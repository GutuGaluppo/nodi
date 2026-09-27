import { useCallback, useMemo } from "react";
import { useCreateNotebook, useNotebooks } from "../notebooks/notebookQueries";
import { useUpdateNote } from "../notes/useUpdateNote";
import { useSetReminder } from "../reminders/reminderQueries";
import { useAddTagToNote } from "../tags/noteTagQueries";
import { useCreateTag, useTags } from "../tags/tagQueries";
import {
  type ResolvedTarget,
  resolveName,
  type VoiceOrganization,
} from "./voiceDirectives";

/** One change a dictation asks for, shown in the preview before it happens. */
export type VoiceAction =
  | { key: string; kind: "title"; value: string }
  | { key: string; kind: "notebook"; target: ResolvedTarget }
  | { key: string; kind: "tag"; target: ResolvedTarget }
  | { key: string; kind: "reminder"; at: Date };

/**
 * Turns spoken directives into concrete actions against the user's existing
 * notebooks and tags. Names that match nothing become "new" actions: they are
 * shown as new in the preview and are only created when the user inserts.
 */
export function useVoiceActions(organize: VoiceOrganization | null) {
  const notebooks = useNotebooks();
  const tags = useTags();
  const updateNote = useUpdateNote();
  const createNotebook = useCreateNotebook();
  const createTag = useCreateTag();
  const addTagToNote = useAddTagToNote();
  const setReminder = useSetReminder();

  const actions = useMemo<VoiceAction[]>(() => {
    if (organize === null) return [];
    const list: VoiceAction[] = [];
    if (organize.title) {
      list.push({ key: "title", kind: "title", value: organize.title });
    }
    if (organize.notebook) {
      const available = (notebooks.data ?? []).filter(
        (notebook) => notebook.deletedAt === null,
      );
      list.push({
        key: "notebook",
        kind: "notebook",
        target: resolveName(organize.notebook, available),
      });
    }
    const seen = new Set<string>();
    for (const spoken of organize.tags) {
      const target = resolveName(spoken, tags.data ?? []);
      const key = `tag:${target.id ?? target.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ key, kind: "tag", target });
    }
    if (organize.reminder) {
      list.push({ key: "reminder", kind: "reminder", at: organize.reminder });
    }
    return list;
  }, [organize, notebooks.data, tags.data]);

  const apply = useCallback(
    async (noteId: string, chosen: VoiceAction[]): Promise<void> => {
      for (const action of chosen) {
        if (action.kind === "title") {
          await updateNote.mutateAsync({
            id: noteId,
            patch: { title: action.value },
          });
        } else if (action.kind === "notebook") {
          const notebookId =
            action.target.id ??
            (await createNotebook.mutateAsync(action.target.name)).id;
          await updateNote.mutateAsync({ id: noteId, patch: { notebookId } });
        } else if (action.kind === "reminder") {
          await setReminder.mutateAsync({ noteId, remindAt: action.at });
        } else {
          const tagId =
            action.target.id ??
            (await createTag.mutateAsync(action.target.name)).id;
          await addTagToNote.mutateAsync({ noteId, tagId });
        }
      }
    },
    [updateNote, createNotebook, createTag, addTagToNote, setReminder],
  );

  return { actions, apply, isReady: !notebooks.isPending && !tags.isPending };
}

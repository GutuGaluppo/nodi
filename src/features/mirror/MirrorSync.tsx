import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { runMirror } from "./markdownMirror";
import { mirrorKeys, useMirrorFolder } from "./mirrorQueries";

const DEBOUNCE_MS = 2_000;

/**
 * Keeps the Markdown mirror current while a folder is set: one pass at launch,
 * then one pass two seconds after the last successful change to the library
 * (autosaves, titles, notebooks, tags, Trash). Passes never overlap.
 */
function MirrorSync() {
  const client = useQueryClient();
  const folder = useMirrorFolder();
  const active = Boolean(folder.data);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let again = false;

    async function pass(): Promise<void> {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        await runMirror();
        await client.invalidateQueries({ queryKey: mirrorKeys.lastRun });
      } catch (error) {
        console.error("NODI could not update the Markdown mirror", error);
      } finally {
        running = false;
        if (again) {
          again = false;
          schedule();
        }
      }
    }

    function schedule(): void {
      clearTimeout(timer);
      timer = setTimeout(() => void pass(), DEBOUNCE_MS);
    }

    void pass();
    const unsubscribe = client.getMutationCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "success" &&
        !event.mutation.meta?.mirror
      ) {
        schedule();
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [active, client]);

  return null;
}

export default MirrorSync;

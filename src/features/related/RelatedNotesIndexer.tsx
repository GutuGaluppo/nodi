import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { embedStaleNotes } from "./embedNotes";

export const relatedKeys = { all: ["related"] as const };

const DEBOUNCE_MS = 5_000;

/**
 * Keeps note embeddings current (REL-001): one pass at launch, then one pass
 * five seconds after library changes settle. Passes never overlap.
 */
function RelatedNotesIndexer() {
  const client = useQueryClient();

  useEffect(() => {
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
        if ((await embedStaleNotes()) > 0) {
          await client.invalidateQueries({ queryKey: relatedKeys.all });
        }
      } catch (error) {
        console.error("NODI could not update related notes", error);
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
      if (event.type === "updated" && event.action.type === "success") {
        schedule();
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [client]);

  return null;
}

export default RelatedNotesIndexer;

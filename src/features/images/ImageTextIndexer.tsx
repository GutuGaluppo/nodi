import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { searchKeys } from "../search/searchQueries";
import { recognizePendingImages } from "./recognizeImages";
import { imageTextKeys } from "./useImageInsertion";

const DEBOUNCE_MS = 3_000;

/** Progress of the current pass, readable by the "Your data" page. */
export const imageTextProgressKey = ["image-text", "progress"] as const;

/**
 * Keeps image text current (OCR-002): one pass at launch, then one pass three
 * seconds after library changes settle. Passes never overlap.
 */
function ImageTextIndexer() {
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
        const processed = await recognizePendingImages(
          undefined,
          (done, total) =>
            client.setQueryData(imageTextProgressKey, { done, total }),
        );
        if (processed > 0) {
          await client.invalidateQueries({ queryKey: imageTextKeys.all });
          await client.invalidateQueries({ queryKey: searchKeys.all });
        }
      } catch (error) {
        console.error("NODI could not update image text", error);
      } finally {
        client.setQueryData(imageTextProgressKey, null);
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

export default ImageTextIndexer;

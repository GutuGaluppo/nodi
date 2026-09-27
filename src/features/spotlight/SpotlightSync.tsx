import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { isSpotlightEnabled, syncSpotlight } from "./spotlight";

export const spotlightKeys = {
  enabled: ["spotlight", "enabled"] as const,
  lastRun: ["spotlight", "last-run"] as const,
};

const DEBOUNCE_MS = 3_000;

/**
 * While Spotlight is on, keeps its entries current: one pass at launch and one
 * three seconds after library changes settle (MAC-002). While it is off, any
 * entries left behind are cleared at launch, so "off" means nothing indexed.
 */
function SpotlightSync() {
  const client = useQueryClient();
  const enabled = useQuery({
    queryKey: spotlightKeys.enabled,
    queryFn: isSpotlightEnabled,
  });
  const active = enabled.data === true;

  useEffect(() => {
    if (enabled.data === false) {
      invoke("spotlight_clear").catch(() => undefined);
    }
  }, [enabled.data]);

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
        await syncSpotlight();
      } catch (error) {
        console.error("NODI could not update Spotlight", error);
      } finally {
        await client.invalidateQueries({ queryKey: spotlightKeys.lastRun });
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
        !event.mutation.meta?.spotlight
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

export default SpotlightSync;

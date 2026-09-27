import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import type { Capture } from "./captureNote";

const EVENT_QUICK_NOTE = "nodi://quick-note";
const EVENT_CAPTURE = "nodi://capture";
const EVENT_OPEN_NOTE = "nodi://open-note";

interface CaptureHandlers {
  /** ⌥⌘N or the menu bar's New Note. */
  onQuickNote: () => void;
  /** Content sent through `nodi://new` (Share menu, Shortcuts). */
  onCapture: (capture: Capture) => void;
  /** A note chosen in Spotlight. */
  onOpenNote?: (noteId: string) => void;
}

/**
 * Connects NODI's capture entry points to the workspace. Captures are drained
 * from the native queue at mount and on each signal, so one that arrived
 * while NODI was starting is still delivered, exactly once.
 */
export function useCaptureEvents(handlers: CaptureHandlers): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    // A capture taken from the native queue exists nowhere else, so it is
    // always delivered, even if this effect was cleaned up meanwhile (React
    // runs effects twice in development).
    async function drain(): Promise<void> {
      const captures = await invoke<Capture[]>("take_pending_captures").catch(
        () => [],
      );
      for (const capture of captures ?? []) latest.current.onCapture(capture);
    }

    async function openChosen(): Promise<void> {
      const noteId = await invoke<string | null>("take_pending_open").catch(
        () => null,
      );
      if (noteId) latest.current.onOpenNote?.(noteId);
    }

    void drain();
    void openChosen();
    const subscriptions = [
      listen(EVENT_QUICK_NOTE, () => latest.current.onQuickNote()).catch(
        () => undefined,
      ),
      listen(EVENT_CAPTURE, () => void drain()).catch(() => undefined),
      listen(EVENT_OPEN_NOTE, () => void openChosen()).catch(() => undefined),
    ];
    return () => {
      for (const subscription of subscriptions) {
        void subscription.then((unlisten) => unlisten?.());
      }
    };
  }, []);
}

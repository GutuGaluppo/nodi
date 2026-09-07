import { useEffect, useRef } from "react";
import { isApplePlatform } from "../lib/platform/platform";

/**
 * One entry in the global keyboard shortcut registry.
 *
 * `keys` is a small vocabulary: the optional modifiers `"mod"` (⌘ on Apple
 * platforms, Ctrl elsewhere), `"shift"`, `"alt"`, plus exactly one non-modifier
 * key matched against `KeyboardEvent.key` (case-insensitive), e.g.
 * `["mod", "n"]` or `["mod", "shift", "p"]`.
 */
export interface AppShortcut {
  id: string;
  keys: string[];
  label: string;
  action: () => void;
}

export function matchesShortcut(event: KeyboardEvent, keys: string[]): boolean {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const wantMod = wanted.delete("mod");
  const wantShift = wanted.delete("shift");
  const wantAlt = wanted.delete("alt");
  const [key] = [...wanted];

  if (!key || event.key.toLowerCase() !== key) {
    return false;
  }

  const modActive = isApplePlatform() ? event.metaKey : event.ctrlKey;
  return (
    wantMod === modActive &&
    wantShift === event.shiftKey &&
    wantAlt === event.altKey
  );
}

interface UseGlobalShortcutsOptions {
  enabled?: boolean;
}

/**
 * Attach a single window-level keydown listener that dispatches the first
 * matching shortcut and prevents its default. The registry may change between
 * renders without re-binding the listener.
 */
export function useGlobalShortcuts(
  shortcuts: AppShortcut[],
  options: UseGlobalShortcutsOptions = {},
): void {
  const enabled = options.enabled ?? true;
  const registry = useRef(shortcuts);
  registry.current = shortcuts;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      for (const shortcut of registry.current) {
        if (matchesShortcut(event, shortcut.keys)) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as platform from "../lib/platform/platform";
import {
  type AppShortcut,
  matchesShortcut,
  useGlobalShortcuts,
} from "./shortcuts";

afterEach(() => {
  vi.restoreAllMocks();
});

function shortcut(overrides: Partial<AppShortcut> = {}): AppShortcut {
  return {
    id: "new-note",
    keys: ["mod", "n"],
    label: "New note",
    action: vi.fn(),
    ...overrides,
  };
}

describe("matchesShortcut", () => {
  it("matches ctrl+n on non-Apple platforms", () => {
    vi.spyOn(platform, "isApplePlatform").mockReturnValue(false);
    const event = new KeyboardEvent("keydown", { key: "n", ctrlKey: true });

    expect(matchesShortcut(event, ["mod", "n"])).toBe(true);
    expect(matchesShortcut(event, ["mod", "shift", "n"])).toBe(false);
  });

  it("matches cmd+n on Apple platforms and rejects the bare key", () => {
    vi.spyOn(platform, "isApplePlatform").mockReturnValue(true);

    expect(
      matchesShortcut(
        new KeyboardEvent("keydown", { key: "n", metaKey: true }),
        ["mod", "n"],
      ),
    ).toBe(true);
    expect(
      matchesShortcut(new KeyboardEvent("keydown", { key: "n" }), ["mod", "n"]),
    ).toBe(false);
  });
});

describe("useGlobalShortcuts", () => {
  it("runs the matching action and prevents the default", () => {
    vi.spyOn(platform, "isApplePlatform").mockReturnValue(false);
    const entry = shortcut();
    renderHook(() => useGlobalShortcuts([entry]));

    const event = new KeyboardEvent("keydown", {
      key: "n",
      ctrlKey: true,
      cancelable: true,
    });
    fireEvent(window, event);

    expect(entry.action).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("does nothing while disabled", () => {
    vi.spyOn(platform, "isApplePlatform").mockReturnValue(false);
    const entry = shortcut();
    renderHook(() => useGlobalShortcuts([entry], { enabled: false }));

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });

    expect(entry.action).not.toHaveBeenCalled();
  });

  it("stops listening after unmount", () => {
    vi.spyOn(platform, "isApplePlatform").mockReturnValue(false);
    const entry = shortcut();
    const { unmount } = renderHook(() => useGlobalShortcuts([entry]));

    unmount();
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });

    expect(entry.action).not.toHaveBeenCalled();
  });
});

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCaptureEvents } from "./useCaptureEvents";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const listeners = new Map<string, () => void>();

beforeEach(() => {
  listeners.clear();
  vi.mocked(listen).mockImplementation(async (event, handler) => {
    listeners.set(event, () => handler({} as never));
    return () => undefined;
  });
  vi.mocked(invoke).mockReset();
});

describe("useCaptureEvents", () => {
  it("delivers captures that arrived before the app was ready", async () => {
    const capture = { title: "Shared", text: "From Safari", url: null };
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === "take_pending_captures" ? [capture] : null,
    );
    const onCapture = vi.fn();

    renderHook(() => useCaptureEvents({ onQuickNote: vi.fn(), onCapture }));

    await waitFor(() => expect(onCapture).toHaveBeenCalledWith(capture));
    expect(invoke).toHaveBeenCalledWith("take_pending_captures");
  });

  it("drains the queue again when a capture arrives", async () => {
    let queue: unknown[] = [];
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command !== "take_pending_captures") return null;
      const taken = queue;
      queue = [];
      return taken;
    });
    const onCapture = vi.fn();
    renderHook(() => useCaptureEvents({ onQuickNote: vi.fn(), onCapture }));
    await waitFor(() => expect(listeners.has("nodi://capture")).toBe(true));

    queue = [{ title: "", text: "Later", url: null }];
    listeners.get("nodi://capture")?.();

    await waitFor(() => expect(onCapture).toHaveBeenCalledOnce());
  });

  it("starts a note for the global shortcut", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    const onQuickNote = vi.fn();
    renderHook(() => useCaptureEvents({ onQuickNote, onCapture: vi.fn() }));
    await waitFor(() => expect(listeners.has("nodi://quick-note")).toBe(true));

    listeners.get("nodi://quick-note")?.();

    expect(onQuickNote).toHaveBeenCalledOnce();
  });

  it("opens the note chosen in Spotlight", async () => {
    let chosen: string | null = "note-7";
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command !== "take_pending_open") return [];
      const taken = chosen;
      chosen = null;
      return taken;
    });
    const onOpenNote = vi.fn();

    renderHook(() =>
      useCaptureEvents({
        onQuickNote: vi.fn(),
        onCapture: vi.fn(),
        onOpenNote,
      }),
    );

    await waitFor(() => expect(onOpenNote).toHaveBeenCalledWith("note-7"));
    expect(onOpenNote).toHaveBeenCalledOnce();
  });

  it("delivers a queued capture exactly once under StrictMode", async () => {
    let queue: unknown[] = [{ title: "Shared", text: "Once", url: null }];
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command !== "take_pending_captures") return null;
      const taken = queue;
      queue = [];
      return taken;
    });
    const onCapture = vi.fn();

    renderHook(() => useCaptureEvents({ onQuickNote: vi.fn(), onCapture }), {
      wrapper: StrictMode,
    });

    await waitFor(() => expect(onCapture).toHaveBeenCalledOnce());
  });
});

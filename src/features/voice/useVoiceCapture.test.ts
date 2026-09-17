import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVoiceCapture } from "./useVoiceCapture";

const invokeMock = vi.fn();
const listenHandlers = new Map<string, (event: { payload: unknown }) => void>();
const listenMock = vi.fn(
  (eventName: string, handler: (event: { payload: unknown }) => void) => {
    listenHandlers.set(eventName, handler);
    return Promise.resolve(() => listenHandlers.delete(eventName));
  },
);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) =>
    listenMock(args[0] as string, args[1] as (event: unknown) => void),
}));

function emit(eventName: string, payload: unknown): void {
  listenHandlers.get(eventName)?.({ payload });
}

const completedPayload = {
  sessionId: "voice-1",
  noteId: "note-1",
  language: "pt-BR",
  text: "texto ditado",
  durationMs: 1500,
  segments: [],
  limitReached: false,
};

describe("useVoiceCapture", () => {
  afterEach(() => {
    invokeMock.mockReset();
    listenMock.mockClear();
    listenHandlers.clear();
    vi.useRealTimers();
  });

  it("starts idle with no active session", () => {
    const { result } = renderHook(() => useVoiceCapture());
    expect(result.current.state.phase).toBe("idle");
    expect(result.current.state.sessionId).toBeNull();
  });

  it("moves to recording once the backend accepts the session", async () => {
    invokeMock.mockResolvedValueOnce({ sessionId: "voice-1" });
    const { result } = renderHook(() => useVoiceCapture());

    await act(async () => {
      await result.current.start("note-1", "pt-BR");
    });

    expect(invokeMock).toHaveBeenCalledWith("start_voice_capture", {
      noteId: "note-1",
      language: "pt-BR",
    });
    expect(result.current.state.phase).toBe("recording");
    expect(result.current.state.sessionId).toBe("voice-1");
  });

  it("surfaces the backend error when start_voice_capture is rejected", async () => {
    invokeMock.mockRejectedValueOnce({ code: "SessionAlreadyActive" });
    const { result } = renderHook(() => useVoiceCapture());

    await act(async () => {
      await result.current.start("note-1", "pt-BR");
    });

    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error?.code).toBe("SessionAlreadyActive");
  });

  it("ignores state events tagged with a session other than the active one", async () => {
    invokeMock.mockResolvedValueOnce({ sessionId: "voice-1" });
    const { result } = renderHook(() => useVoiceCapture());
    await act(async () => {
      await result.current.start("note-1", "pt-BR");
    });
    await waitFor(() =>
      expect(listenHandlers.has("voice-transcription://state")).toBe(true),
    );

    act(() => {
      emit("voice-transcription://state", {
        sessionId: "voice-stale",
        noteId: "note-1",
        phase: "transcribing",
      });
    });
    expect(result.current.state.phase).toBe("recording");

    act(() => {
      emit("voice-transcription://state", {
        sessionId: "voice-1",
        noteId: "note-1",
        phase: "transcribing",
      });
    });
    expect(result.current.state.phase).toBe("transcribing");
  });

  it("moves to stopping immediately when stop is called, without waiting for the backend", async () => {
    invokeMock.mockResolvedValueOnce({ sessionId: "voice-1" });
    invokeMock.mockImplementationOnce(() => new Promise(() => undefined));
    const { result } = renderHook(() => useVoiceCapture());
    await act(async () => {
      await result.current.start("note-1", "pt-BR");
    });

    act(() => {
      result.current.stop();
    });

    expect(result.current.state.phase).toBe("stopping");
    expect(invokeMock).toHaveBeenCalledWith("stop_voice_capture", {
      sessionId: "voice-1",
    });
  });

  it("stores the completed result tied to its session", async () => {
    invokeMock.mockResolvedValueOnce({ sessionId: "voice-1" });
    const { result } = renderHook(() => useVoiceCapture());
    await act(async () => {
      await result.current.start("note-1", "pt-BR");
    });
    await waitFor(() =>
      expect(listenHandlers.has("voice-transcription://completed")).toBe(true),
    );

    act(() => {
      emit("voice-transcription://completed", completedPayload);
    });

    expect(result.current.state.phase).toBe("completed");
    expect(result.current.state.result).toEqual(completedPayload);
  });

  it("keeps the transcribing phase visible for at least two seconds even when the backend resolves instantly", async () => {
    invokeMock.mockResolvedValueOnce({ sessionId: "voice-1" });
    const { result } = renderHook(() => useVoiceCapture());
    await act(async () => {
      await result.current.start("note-1", "pt-BR");
    });
    await waitFor(() =>
      expect(listenHandlers.has("voice-transcription://completed")).toBe(true),
    );

    act(() => {
      emit("voice-transcription://state", {
        sessionId: "voice-1",
        noteId: "note-1",
        phase: "transcribing",
      });
    });
    expect(result.current.state.phase).toBe("transcribing");

    vi.useFakeTimers();
    act(() => {
      emit("voice-transcription://completed", completedPayload);
    });
    // The backend already resolved, but the two-second minimum hasn't
    // elapsed yet, so the animation should still be showing.
    expect(result.current.state.phase).toBe("transcribing");

    // Real time elapses between marking "transcribing" (real clock) and
    // switching to fake timers just above, so the remaining wait can be a
    // touch under 2000ms; assert well inside the window on both sides
    // rather than against the exact millisecond.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.state.phase).toBe("transcribing");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(result.current.state.phase).toBe("completed");
  });

  it("dispatches immediately once the minimum display time has already elapsed", async () => {
    invokeMock.mockResolvedValueOnce({ sessionId: "voice-1" });
    const { result } = renderHook(() => useVoiceCapture());
    await act(async () => {
      await result.current.start("note-1", "pt-BR");
    });
    await waitFor(() =>
      expect(listenHandlers.has("voice-transcription://completed")).toBe(true),
    );

    act(() => {
      emit("voice-transcription://state", {
        sessionId: "voice-1",
        noteId: "note-1",
        phase: "transcribing",
      });
    });

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    act(() => {
      emit("voice-transcription://completed", completedPayload);
    });
    expect(result.current.state.phase).toBe("completed");
  });

  it("dismiss resets the session back to idle", async () => {
    invokeMock.mockResolvedValueOnce({ sessionId: "voice-1" });
    const { result } = renderHook(() => useVoiceCapture());
    await act(async () => {
      await result.current.start("note-1", "pt-BR");
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.state.phase).toBe("idle");
    expect(result.current.state.sessionId).toBeNull();
  });

  it("returns to idle once the backend confirms a cancellation", async () => {
    invokeMock.mockResolvedValueOnce({ sessionId: "voice-1" });
    invokeMock.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useVoiceCapture());
    await act(async () => {
      await result.current.start("note-1", "pt-BR");
    });

    act(() => {
      result.current.cancel();
    });
    expect(result.current.state.phase).toBe("cancelling");

    await waitFor(() =>
      expect(listenHandlers.has("voice-transcription://state")).toBe(true),
    );
    act(() => {
      emit("voice-transcription://state", {
        sessionId: "voice-1",
        noteId: "note-1",
        phase: "cancelling",
      });
    });

    expect(result.current.state.phase).toBe("idle");
    expect(result.current.state.sessionId).toBeNull();
  });
});

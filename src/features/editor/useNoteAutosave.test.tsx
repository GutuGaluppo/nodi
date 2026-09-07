import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type NoteContentDraft, useNoteAutosave } from "./useNoteAutosave";

const draft: NoteContentDraft = {
  contentJson: '{"type":"doc","content":[]}',
  contentText: "Hello",
};

describe("useNoteAutosave", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces repeated edits into one save", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoteAutosave("n1", save));

    act(() => {
      result.current.queue({ ...draft, contentText: "H" });
      result.current.queue({ ...draft, contentText: "He" });
      result.current.queue(draft);
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("dirty");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(449);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("n1", draft);
    expect(result.current.status).toBe("saved");
  });

  it("flushes a pending edit immediately", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoteAutosave("n1", save));

    act(() => result.current.queue(draft));
    await act(() => result.current.flush());

    expect(save).toHaveBeenCalledOnce();
  });

  it("flushes the latest draft when switching notes", () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ noteId }) => useNoteAutosave(noteId, save),
      { initialProps: { noteId: "n1" } },
    );

    act(() => result.current.queue(draft));
    rerender({ noteId: "n2" });

    expect(save).toHaveBeenCalledWith("n1", draft);
  });

  it("retains the draft and retries after a failed save", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useNoteAutosave("n1", save));

    act(() => result.current.queue(draft));
    await act(() => result.current.flush());

    expect(result.current.status).toBe("error");

    await act(() => result.current.flush());

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("n1", draft);
    expect(result.current.status).toBe("saved");
  });
});

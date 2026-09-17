import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  type CompletedEventPayload,
  EVENT_COMPLETED,
  EVENT_FAILED,
  EVENT_LEVEL,
  EVENT_STATE,
  type FailedEventPayload,
  type LevelEventPayload,
  type StateEventPayload,
} from "./voiceEvents";

export type VoiceCapturePhase =
  | "idle"
  | "starting"
  | "recording"
  | "stopping"
  | "transcribing"
  | "cancelling"
  | "completed"
  | "error";

export interface VoiceCaptureError {
  code: string;
  message: string;
}

export interface VoiceCaptureState {
  phase: VoiceCapturePhase;
  sessionId: string | null;
  noteId: string | null;
  level: number;
  result: CompletedEventPayload | null;
  error: VoiceCaptureError | null;
}

type Action =
  | { type: "start-requested" }
  | { type: "command-failed"; error: VoiceCaptureError }
  | { type: "session-started"; sessionId: string; noteId: string }
  | { type: "stop-requested" }
  | { type: "cancel-requested" }
  | { type: "backend-state"; payload: StateEventPayload }
  | { type: "level"; level: number }
  | { type: "completed"; payload: CompletedEventPayload }
  | { type: "failed"; payload: FailedEventPayload }
  | { type: "dismiss" };

// The transcribing animation is part of the UX, not just a technical
// necessity — for short recordings the backend can resolve in well under a
// second, which flashes the animation before it's perceptible. Holding the
// "transcribing" phase open for at least this long lets it actually be seen.
const MIN_TRANSCRIBING_DISPLAY_MS = 2000;

const initialState: VoiceCaptureState = {
  phase: "idle",
  sessionId: null,
  noteId: null,
  level: 0,
  result: null,
  error: null,
};

function reducer(state: VoiceCaptureState, action: Action): VoiceCaptureState {
  switch (action.type) {
    case "start-requested":
      return { ...initialState, phase: "starting" };
    case "command-failed":
      return { ...initialState, phase: "error", error: action.error };
    case "session-started":
      return {
        ...state,
        phase: "recording",
        sessionId: action.sessionId,
        noteId: action.noteId,
      };
    case "stop-requested":
      return state.sessionId === null ? state : { ...state, phase: "stopping" };
    case "cancel-requested":
      return state.sessionId === null
        ? state
        : { ...state, phase: "cancelling" };
    case "backend-state": {
      if (action.payload.sessionId !== state.sessionId) {
        return state;
      }
      if (action.payload.phase === "cancelling") {
        return { ...initialState };
      }
      return { ...state, phase: action.payload.phase };
    }
    case "level":
      return { ...state, level: action.level };
    case "completed":
      if (action.payload.sessionId !== state.sessionId) {
        return state;
      }
      return { ...state, phase: "completed", result: action.payload };
    case "failed":
      if (action.payload.sessionId !== state.sessionId) {
        return state;
      }
      return {
        ...state,
        phase: "error",
        error: { code: action.payload.code, message: action.payload.message },
      };
    case "dismiss":
      return { ...initialState };
    default:
      return state;
  }
}

function toVoiceCaptureError(error: unknown): VoiceCaptureError {
  if (typeof error === "object" && error !== null && "code" in error) {
    const candidate = error as { code: unknown; message?: unknown };
    const code = String(candidate.code);
    return {
      code,
      message:
        candidate.message === undefined ? code : String(candidate.message),
    };
  }
  return { code: "unknown", message: String(error) };
}

/**
 * Drives one voice-capture session: starts/stops/cancels the backend
 * recording and subscribes to its `voice-transcription://*` events, ignoring
 * anything tagged with a session ID other than the one this hook started
 * (docs/VOICE_TRANSCRIPTION_APPROACH.md section 3.3).
 */
export function useVoiceCapture() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = state.sessionId;
  const transcribingStartedAtRef = useRef<number | null>(null);
  const pendingResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const dispatchAfterMinimumTranscribingTime = useCallback((action: Action) => {
    if (pendingResultTimeoutRef.current !== null) {
      clearTimeout(pendingResultTimeoutRef.current);
      pendingResultTimeoutRef.current = null;
    }
    const startedAt = transcribingStartedAtRef.current;
    const elapsed = startedAt === null ? Infinity : Date.now() - startedAt;
    const remaining = MIN_TRANSCRIBING_DISPLAY_MS - elapsed;
    if (remaining <= 0) {
      dispatch(action);
      return;
    }
    pendingResultTimeoutRef.current = setTimeout(() => {
      pendingResultTimeoutRef.current = null;
      dispatch(action);
    }, remaining);
  }, []);

  useEffect(() => {
    // Tauri's IPC bridge may not be ready yet (or, in tests, may not exist
    // at all) when this effect first runs; swallow registration failures
    // here instead of leaving them as unhandled rejections.
    const unlistenPromises = [
      listen<StateEventPayload>(EVENT_STATE, (event) => {
        if (event.payload.phase === "transcribing") {
          transcribingStartedAtRef.current = Date.now();
        }
        dispatch({ type: "backend-state", payload: event.payload });
      }).catch(() => undefined),
      listen<LevelEventPayload>(EVENT_LEVEL, (event) => {
        if (event.payload.sessionId === sessionIdRef.current) {
          dispatch({ type: "level", level: event.payload.level });
        }
      }).catch(() => undefined),
      listen<CompletedEventPayload>(EVENT_COMPLETED, (event) => {
        dispatchAfterMinimumTranscribingTime({
          type: "completed",
          payload: event.payload,
        });
      }).catch(() => undefined),
      listen<FailedEventPayload>(EVENT_FAILED, (event) => {
        dispatchAfterMinimumTranscribingTime({
          type: "failed",
          payload: event.payload,
        });
      }).catch(() => undefined),
    ];

    return () => {
      for (const promise of unlistenPromises) {
        void promise.then((unlisten) => unlisten?.());
      }
      if (pendingResultTimeoutRef.current !== null) {
        clearTimeout(pendingResultTimeoutRef.current);
      }
    };
  }, [dispatchAfterMinimumTranscribingTime]);

  const start = useCallback(async (noteId: string, language: string) => {
    transcribingStartedAtRef.current = null;
    if (pendingResultTimeoutRef.current !== null) {
      clearTimeout(pendingResultTimeoutRef.current);
      pendingResultTimeoutRef.current = null;
    }
    dispatch({ type: "start-requested" });
    try {
      const { sessionId } = await invoke<{ sessionId: string }>(
        "start_voice_capture",
        { noteId, language },
      );
      dispatch({ type: "session-started", sessionId, noteId });
    } catch (error) {
      dispatch({ type: "command-failed", error: toVoiceCaptureError(error) });
    }
  }, []);

  const stop = useCallback(() => {
    if (state.sessionId === null) {
      return;
    }
    dispatch({ type: "stop-requested" });
    void invoke("stop_voice_capture", { sessionId: state.sessionId }).catch(
      (error) =>
        dispatch({
          type: "command-failed",
          error: toVoiceCaptureError(error),
        }),
    );
  }, [state.sessionId]);

  const cancel = useCallback(() => {
    if (state.sessionId === null) {
      return;
    }
    dispatch({ type: "cancel-requested" });
    void invoke("cancel_voice_capture", { sessionId: state.sessionId }).catch(
      (error) =>
        dispatch({
          type: "command-failed",
          error: toVoiceCaptureError(error),
        }),
    );
  }, [state.sessionId]);

  const dismiss = useCallback(() => {
    dispatch({ type: "dismiss" });
  }, []);

  return { state, start, stop, cancel, dismiss };
}

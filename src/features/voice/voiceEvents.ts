export const EVENT_STATE = "voice-transcription://state";
export const EVENT_LEVEL = "voice-transcription://level";
export const EVENT_COMPLETED = "voice-transcription://completed";
export const EVENT_FAILED = "voice-transcription://failed";

/** Mirrors `voice::session::SessionPhase::as_str()` in the Rust backend. */
export type BackendVoicePhase =
  | "recording"
  | "stopping"
  | "transcribing"
  | "cancelling";

export interface StateEventPayload {
  sessionId: string;
  noteId: string;
  phase: BackendVoicePhase;
}

export interface LevelEventPayload {
  sessionId: string;
  level: number;
}

export interface TranscriptionSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface CompletedEventPayload {
  sessionId: string;
  noteId: string;
  language: string;
  text: string;
  durationMs: number;
  segments: TranscriptionSegment[];
  limitReached: boolean;
}

export interface FailedEventPayload {
  sessionId: string;
  noteId: string;
  code: string;
  message: string;
}

use serde::Serialize;

use super::engine::TranscriptionSegment;

pub const EVENT_STATE: &str = "voice-transcription://state";
pub const EVENT_LEVEL: &str = "voice-transcription://level";
pub const EVENT_COMPLETED: &str = "voice-transcription://completed";
pub const EVENT_FAILED: &str = "voice-transcription://failed";

/// Every event carries `sessionId` so frontend and backend can both discard
/// events belonging to a session that is no longer the active one (see
/// approach doc section 3.3).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatePayload {
    pub session_id: String,
    pub note_id: String,
    pub phase: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LevelPayload {
    pub session_id: String,
    pub level: f32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompletedPayload {
    pub session_id: String,
    pub note_id: String,
    pub language: String,
    pub text: String,
    pub duration_ms: u64,
    pub segments: Vec<TranscriptionSegment>,
    pub limit_reached: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FailedPayload {
    pub session_id: String,
    pub note_id: String,
    pub code: String,
    pub message: String,
}

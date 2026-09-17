use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use super::capture::CaptureHandle;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionPhase {
    Recording,
    Stopping,
    Transcribing,
    Cancelling,
}

impl SessionPhase {
    pub fn as_str(self) -> &'static str {
        match self {
            SessionPhase::Recording => "recording",
            SessionPhase::Stopping => "stopping",
            SessionPhase::Transcribing => "transcribing",
            SessionPhase::Cancelling => "cancelling",
        }
    }
}

pub struct ActiveSession {
    pub session_id: String,
    pub phase: SessionPhase,
    pub capture: CaptureHandle,
}

/// The single active voice session, if any. Guarded by a managed Tauri state
/// (not a global/static) so only one capture can run at a time, per
/// docs/VOICE_TRANSCRIPTION_APPROACH.md decision #17.
#[derive(Default)]
pub struct VoiceState(pub Mutex<Option<ActiveSession>>);

static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Ephemeral, never persisted — unlike domain record IDs (UUID v7, see
/// DECISIONS.md D-001) this only needs to be unique for the process lifetime.
pub fn new_session_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = SESSION_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("voice-{nanos:x}-{sequence:x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice::capture;

    #[test]
    fn new_session_id_is_unique_across_calls() {
        let first = new_session_id();
        let second = new_session_id();
        assert_ne!(first, second);
    }

    #[test]
    fn voice_state_starts_empty() {
        let state = VoiceState::default();
        assert!(state.0.lock().unwrap().is_none());
    }

    #[test]
    fn voice_state_holds_only_one_session_at_a_time() {
        let state = VoiceState::default();
        let mut guard = state.0.lock().unwrap();
        *guard = Some(ActiveSession {
            session_id: "voice-1".into(),
            phase: SessionPhase::Recording,
            capture: capture::CaptureHandle::for_test(),
        });

        assert!(guard.is_some());
        assert_eq!(guard.as_ref().unwrap().phase, SessionPhase::Recording);
    }

    #[test]
    fn session_phase_labels_match_the_documented_event_contract() {
        assert_eq!(SessionPhase::Recording.as_str(), "recording");
        assert_eq!(SessionPhase::Stopping.as_str(), "stopping");
        assert_eq!(SessionPhase::Transcribing.as_str(), "transcribing");
        assert_eq!(SessionPhase::Cancelling.as_str(), "cancelling");
    }
}

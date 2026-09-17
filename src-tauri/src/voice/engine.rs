use serde::Serialize;

/// Language hint passed to the transcription engine. `Auto` lets the engine
/// detect the spoken language instead of constraining it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    Auto,
    PtBr,
    PtPt,
    En,
}

impl Language {
    pub fn from_code(code: &str) -> Self {
        match code {
            "pt-BR" => Language::PtBr,
            "pt-PT" => Language::PtPt,
            "en" => Language::En,
            _ => Language::Auto,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionSegment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionOutput {
    pub text: String,
    pub segments: Vec<TranscriptionSegment>,
}

#[derive(Debug, Clone)]
pub enum EngineError {
    EmptyAudio,
    Failed(String),
}

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EngineError::EmptyAudio => write!(f, "audio buffer was empty"),
            EngineError::Failed(message) => write!(f, "{message}"),
        }
    }
}

/// Abstraction over the speech-to-text backend. The frontend and the session
/// state machine only ever talk to this trait, so the real `whisper.cpp`
/// binding (or a future `sherpa-onnx`/Apple engine) can be swapped in without
/// touching `session.rs` or `commands.rs`.
///
/// See docs/VOICE_TRANSCRIPTION_APPROACH.md section 3.1.
pub trait TranscriptionEngine: Send + Sync {
    fn transcribe(
        &self,
        samples: &[f32],
        language: Language,
    ) -> Result<TranscriptionOutput, EngineError>;
}

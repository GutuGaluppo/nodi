use super::engine::{EngineError, Language, TranscriptionEngine, TranscriptionOutput, TranscriptionSegment};

/// Stands in for the real `whisper-rs`/`whisper.cpp` binding until the Fase 1
/// spike (docs/VOICE_TRANSCRIPTION_APPROACH.md) lands: it does not transcribe
/// anything. It exists so the capture → session → editor pipeline is real and
/// testable end to end today, with a single, honest swap point later.
pub struct PlaceholderEngine;

impl TranscriptionEngine for PlaceholderEngine {
    fn transcribe(
        &self,
        samples: &[f32],
        _language: Language,
    ) -> Result<TranscriptionOutput, EngineError> {
        if samples.is_empty() {
            return Err(EngineError::EmptyAudio);
        }

        let text = "[transcrição indisponível: motor Whisper ainda não integrado]".to_string();
        Ok(TranscriptionOutput {
            text: text.clone(),
            segments: vec![TranscriptionSegment {
                start_ms: 0,
                end_ms: 0,
                text,
            }],
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_audio() {
        let engine = PlaceholderEngine;
        let result = engine.transcribe(&[], Language::PtBr);
        assert!(matches!(result, Err(EngineError::EmptyAudio)));
    }

    #[test]
    fn returns_a_placeholder_transcript_for_non_empty_audio() {
        let engine = PlaceholderEngine;
        let output = engine
            .transcribe(&[0.1, 0.2, 0.3], Language::Auto)
            .expect("non-empty audio should produce a placeholder result");
        assert!(!output.text.is_empty());
        assert_eq!(output.segments.len(), 1);
    }
}

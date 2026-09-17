use std::path::Path;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::engine::{
    EngineError, Language, TranscriptionEngine, TranscriptionOutput, TranscriptionSegment,
};

/// Real `whisper.cpp` inference, behind the same `TranscriptionEngine` trait
/// as `PlaceholderEngine`. Loads once (model loading is the expensive part)
/// and creates a fresh state per transcription, as `whisper-rs` requires.
pub struct WhisperEngine {
    context: WhisperContext,
}

impl WhisperEngine {
    pub fn load(model_path: &Path) -> Result<Self, EngineError> {
        // whisper.cpp logs each recognized token to stderr by default, which
        // would put transcribed speech into local process logs — redirecting
        // it here (to nowhere, since neither `log` nor `tracing` is wired up)
        // keeps that text out of logs, per
        // docs/VOICE_TRANSCRIPTION_APPROACH.md section 5 ("nunca registrar
        // texto integral reconhecido").
        whisper_rs::install_logging_hooks();

        let context = WhisperContext::new_with_params(
            model_path,
            WhisperContextParameters::default(),
        )
        .map_err(|err| EngineError::Failed(format!("could not load model: {err}")))?;
        Ok(Self { context })
    }
}

impl Language {
    /// ISO 639-1 code whisper.cpp expects, or `None` for auto-detection.
    /// whisper.cpp does not distinguish pt-BR from pt-PT at this level.
    fn whisper_code(self) -> Option<&'static str> {
        match self {
            Language::Auto => None,
            Language::PtBr | Language::PtPt => Some("pt"),
            Language::En => Some("en"),
        }
    }
}

impl TranscriptionEngine for WhisperEngine {
    fn transcribe(
        &self,
        samples: &[f32],
        language: Language,
    ) -> Result<TranscriptionOutput, EngineError> {
        if samples.is_empty() {
            return Err(EngineError::EmptyAudio);
        }

        let mut state = self
            .context
            .create_state()
            .map_err(|err| EngineError::Failed(err.to_string()))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(language.whisper_code());
        params.set_print_progress(false);
        params.set_print_special(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        state
            .full(params, samples)
            .map_err(|err| EngineError::Failed(err.to_string()))?;

        let mut text = String::new();
        let mut segments = Vec::new();
        for segment in state.as_iter() {
            let segment_text = segment
                .to_str_lossy()
                .map_err(|err| EngineError::Failed(err.to_string()))?
                .trim()
                .to_string();
            if segment_text.is_empty() {
                continue;
            }
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(&segment_text);
            // whisper.cpp reports timestamps in centiseconds (10ms units).
            segments.push(TranscriptionSegment {
                start_ms: (segment.start_timestamp().max(0) as u64) * 10,
                end_ms: (segment.end_timestamp().max(0) as u64) * 10,
                text: segment_text,
            });
        }

        if text.is_empty() {
            return Err(EngineError::Failed("no speech detected".into()));
        }

        Ok(TranscriptionOutput { text, segments })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Not run by default: needs a real ggml model and a short WAV sample on
    /// disk, neither of which belong in the repository (see
    /// docs/VOICE_TRANSCRIPTION_APPROACH.md section 1). Point
    /// `NODI_WHISPER_TEST_MODEL` at a multilingual ggml model (e.g.
    /// ggml-base.bin) and `NODI_WHISPER_TEST_WAV` at a mono 16kHz WAV sample
    /// to run it locally: the classic whisper.cpp `samples/jfk.wav` works.
    #[test]
    fn transcribes_a_known_sample_when_a_model_and_wav_are_provided() {
        let (Ok(model_path), Ok(wav_path)) = (
            std::env::var("NODI_WHISPER_TEST_MODEL"),
            std::env::var("NODI_WHISPER_TEST_WAV"),
        ) else {
            eprintln!("skipping: set NODI_WHISPER_TEST_MODEL and NODI_WHISPER_TEST_WAV to run");
            return;
        };

        let mut reader = hound::WavReader::open(&wav_path).expect("sample WAV should open");
        let spec = reader.spec();
        assert_eq!(spec.sample_rate, 16_000, "fixture must already be 16kHz");
        assert_eq!(spec.channels, 1, "fixture must already be mono");
        let samples: Vec<f32> = reader
            .samples::<i16>()
            .map(|sample| sample.expect("sample should decode") as f32 / i16::MAX as f32)
            .collect();

        let engine = WhisperEngine::load(Path::new(&model_path)).expect("model should load");
        let output = engine
            .transcribe(&samples, Language::En)
            .expect("known-good sample should transcribe");

        let lowercase = output.text.to_lowercase();
        assert!(
            lowercase.contains("country"),
            "expected the JFK sample's well-known text, got: {}",
            output.text
        );
    }
}

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
    /// The audio held no recognizable speech.
    NoSpeech,
    Failed(String),
}

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EngineError::EmptyAudio => write!(f, "audio buffer was empty"),
            EngineError::NoSpeech => write!(f, "no speech detected"),
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

/// Length of one transcription chunk: five minutes of 16 kHz audio. Long
/// recordings are transcribed chunk by chunk so progress can be reported and
/// only one chunk is converted to `f32` at a time.
pub const CHUNK_SAMPLES: usize = 16_000 * 300;

/// Transcribes 16 kHz 16-bit audio in chunks, offsetting each chunk's segment
/// timestamps by its position in the recording. Chunks without speech are
/// skipped; `on_progress(done, total)` runs after each chunk. A word spoken
/// across a chunk boundary may be split; five-minute chunks keep that rare.
pub fn transcribe_in_chunks(
    engine: &dyn TranscriptionEngine,
    samples: &[i16],
    language: Language,
    chunk_samples: usize,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<TranscriptionOutput, EngineError> {
    if samples.is_empty() {
        return Err(EngineError::EmptyAudio);
    }
    let chunk_samples = chunk_samples.max(1);
    let total = samples.len().div_ceil(chunk_samples);
    let mut text = String::new();
    let mut segments = Vec::new();

    for (index, chunk) in samples.chunks(chunk_samples).enumerate() {
        let audio: Vec<f32> = chunk
            .iter()
            .map(|sample| *sample as f32 / i16::MAX as f32)
            .collect();
        let offset_ms = (index * chunk_samples) as u64 * 1000 / 16_000;
        match engine.transcribe(&audio, language) {
            Ok(output) => {
                if !output.text.is_empty() {
                    if !text.is_empty() {
                        text.push(' ');
                    }
                    text.push_str(&output.text);
                }
                segments.extend(
                    output
                        .segments
                        .into_iter()
                        .map(|segment| TranscriptionSegment {
                            start_ms: segment.start_ms + offset_ms,
                            end_ms: segment.end_ms + offset_ms,
                            text: segment.text,
                        }),
                );
            }
            Err(EngineError::EmptyAudio | EngineError::NoSpeech) => {}
            Err(error) => return Err(error),
        }
        on_progress(index + 1, total);
    }

    if text.is_empty() {
        return Err(EngineError::NoSpeech);
    }
    Ok(TranscriptionOutput { text, segments })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Answers each chunk with its first sample value, so tests can tell
    /// chunks apart; a chunk starting with 0 has no speech.
    struct EchoEngine {
        calls: Mutex<Vec<usize>>,
    }

    impl TranscriptionEngine for EchoEngine {
        fn transcribe(
            &self,
            samples: &[f32],
            _language: Language,
        ) -> Result<TranscriptionOutput, EngineError> {
            self.calls.lock().unwrap().push(samples.len());
            let marker = (samples[0] * i16::MAX as f32).round() as i32;
            if marker == 0 {
                return Err(EngineError::NoSpeech);
            }
            let text = format!("chunk {marker}");
            Ok(TranscriptionOutput {
                text: text.clone(),
                segments: vec![TranscriptionSegment {
                    start_ms: 100,
                    end_ms: 900,
                    text,
                }],
            })
        }
    }

    fn echo() -> EchoEngine {
        EchoEngine {
            calls: Mutex::new(Vec::new()),
        }
    }

    #[test]
    fn transcribes_each_chunk_and_offsets_its_timestamps() {
        let engine = echo();
        // Three chunks of one second each, marked 1, 2 and 3.
        let mut samples = vec![1i16; 16_000];
        samples.extend(vec![2i16; 16_000]);
        samples.extend(vec![3i16; 8_000]);
        let mut progress = Vec::new();

        let output =
            transcribe_in_chunks(&engine, &samples, Language::En, 16_000, |done, total| {
                progress.push((done, total))
            })
            .expect("speech should be transcribed");

        assert_eq!(output.text, "chunk 1 chunk 2 chunk 3");
        let starts: Vec<u64> = output.segments.iter().map(|s| s.start_ms).collect();
        assert_eq!(starts, vec![100, 1_100, 2_100]);
        assert_eq!(progress, vec![(1, 3), (2, 3), (3, 3)]);
        assert_eq!(*engine.calls.lock().unwrap(), vec![16_000, 16_000, 8_000]);
    }

    #[test]
    fn skips_silent_chunks() {
        let engine = echo();
        let mut samples = vec![0i16; 16_000];
        samples.extend(vec![5i16; 16_000]);

        let output = transcribe_in_chunks(&engine, &samples, Language::En, 16_000, |_, _| {})
            .expect("the second chunk has speech");

        assert_eq!(output.text, "chunk 5");
        assert_eq!(output.segments[0].start_ms, 1_100);
    }

    #[test]
    fn reports_no_speech_when_every_chunk_is_silent() {
        let result =
            transcribe_in_chunks(&echo(), &[0i16; 32_000], Language::En, 16_000, |_, _| {});
        assert!(matches!(result, Err(EngineError::NoSpeech)));
    }

    #[test]
    fn rejects_empty_audio() {
        let result = transcribe_in_chunks(&echo(), &[], Language::En, 16_000, |_, _| {});
        assert!(matches!(result, Err(EngineError::EmptyAudio)));
    }
}

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, TryRecvError};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;

/// Hard cap on a single recording, per docs/VOICE_TRANSCRIPTION_APPROACH.md
/// decision #8. Chosen at the conservative end of the 10-15 minute range to
/// leave memory headroom, since the MVP keeps the whole buffer in `Vec<f32>`.
pub const MAX_CAPTURE_SECS: u64 = 600;

/// Target sample rate the transcription engine expects.
const OUTPUT_SAMPLE_RATE: u32 = 16_000;

pub enum CaptureCommand {
    Stop,
    Cancel,
}

pub enum CaptureOutcome {
    Stopped {
        samples: Vec<f32>,
        duration_ms: u64,
        limit_reached: bool,
    },
    Cancelled,
    Failed(String),
}

#[derive(Debug)]
pub enum CaptureError {
    NoInputDevice,
    UnsupportedFormat(String),
    Config(String),
    Stream(String),
}

impl std::fmt::Display for CaptureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CaptureError::NoInputDevice => write!(f, "no input device available"),
            CaptureError::UnsupportedFormat(format) => {
                write!(f, "unsupported input sample format: {format}")
            }
            CaptureError::Config(message) => write!(f, "could not read input config: {message}"),
            CaptureError::Stream(message) => write!(f, "could not start input stream: {message}"),
        }
    }
}

pub struct CaptureHandle {
    command_tx: mpsc::Sender<CaptureCommand>,
}

impl CaptureHandle {
    pub fn stop(&self) {
        let _ = self.command_tx.send(CaptureCommand::Stop);
    }

    pub fn cancel(&self) {
        let _ = self.command_tx.send(CaptureCommand::Cancel);
    }

    /// A handle with no capture thread behind it, for session-bookkeeping
    /// tests that don't need real audio I/O.
    #[cfg(test)]
    pub fn for_test() -> Self {
        let (command_tx, _command_rx) = mpsc::channel();
        CaptureHandle { command_tx }
    }
}

pub struct CaptureChannels {
    pub handle: CaptureHandle,
    pub outcome_rx: mpsc::Receiver<CaptureOutcome>,
    pub level_rx: mpsc::Receiver<f32>,
}

/// Opens the default input device and starts capturing on a dedicated OS
/// thread (cpal streams are not `Send`, so the thread that opens the stream
/// must also own its lifetime). The caller drives the session through the
/// returned command sender and reads results from the two receivers.
pub fn start() -> Result<CaptureChannels, CaptureError> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or(CaptureError::NoInputDevice)?;
    let supported_config = device
        .default_input_config()
        .map_err(|err| CaptureError::Config(err.to_string()))?;
    let sample_format = supported_config.sample_format();
    let channels = supported_config.channels();
    let input_sample_rate = supported_config.sample_rate().0;
    let config = supported_config.config();

    if !matches!(sample_format, SampleFormat::F32 | SampleFormat::I16) {
        return Err(CaptureError::UnsupportedFormat(format!("{sample_format:?}")));
    }

    let (command_tx, command_rx) = mpsc::channel::<CaptureCommand>();
    let (outcome_tx, outcome_rx) = mpsc::channel::<CaptureOutcome>();
    let (level_tx, level_rx) = mpsc::channel::<f32>();
    // Bounded so a stalled consumer applies backpressure instead of the
    // callback silently growing memory; see approach doc section on capture.
    let (sample_tx, sample_rx) = mpsc::sync_channel::<Vec<f32>>(64);
    let overrun = Arc::new(AtomicBool::new(false));

    {
        let overrun = overrun.clone();
        let outcome_tx = outcome_tx.clone();
        // `cpal::Stream` is not `Send` on CoreAudio, so the stream must be
        // built and dropped on the same thread that owns the capture loop —
        // it can never cross this closure boundary.
        thread::spawn(move || {
            let stream = match build_stream(
                &device,
                &config,
                sample_format,
                channels,
                sample_tx,
                overrun.clone(),
            ) {
                Ok(stream) => stream,
                Err(err) => {
                    let _ = outcome_tx.send(CaptureOutcome::Failed(err.to_string()));
                    return;
                }
            };

            if let Err(err) = stream.play() {
                let _ = outcome_tx.send(CaptureOutcome::Failed(err.to_string()));
                return;
            }

            run_capture_loop(
                command_rx,
                sample_rx,
                level_tx,
                outcome_tx,
                overrun,
                input_sample_rate,
            );

            drop(stream);
        });
    }

    Ok(CaptureChannels {
        handle: CaptureHandle { command_tx },
        outcome_rx,
        level_rx,
    })
}

fn build_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sample_format: SampleFormat,
    channels: u16,
    sample_tx: mpsc::SyncSender<Vec<f32>>,
    overrun: Arc<AtomicBool>,
) -> Result<cpal::Stream, CaptureError> {
    let err_fn = |err: cpal::StreamError| {
        eprintln!("voice capture stream error: {err}");
    };

    let stream = match sample_format {
        SampleFormat::F32 => device.build_input_stream(
            config,
            move |data: &[f32], _| forward_samples(data, channels, &sample_tx, &overrun),
            err_fn,
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            config,
            move |data: &[i16], _| {
                let converted: Vec<f32> = data
                    .iter()
                    .map(|sample| *sample as f32 / i16::MAX as f32)
                    .collect();
                forward_samples(&converted, channels, &sample_tx, &overrun)
            },
            err_fn,
            None,
        ),
        other => return Err(CaptureError::UnsupportedFormat(format!("{other:?}"))),
    };

    stream.map_err(|err| CaptureError::Stream(err.to_string()))
}

fn forward_samples(
    data: &[f32],
    channels: u16,
    sample_tx: &mpsc::SyncSender<Vec<f32>>,
    overrun: &Arc<AtomicBool>,
) {
    let mono = downmix(data, channels as usize);
    if sample_tx.try_send(mono).is_err() {
        overrun.store(true, Ordering::Relaxed);
    }
}

fn downmix(data: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return data.to_vec();
    }
    data.chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn run_capture_loop(
    command_rx: mpsc::Receiver<CaptureCommand>,
    sample_rx: mpsc::Receiver<Vec<f32>>,
    level_tx: mpsc::Sender<f32>,
    outcome_tx: mpsc::Sender<CaptureOutcome>,
    overrun: Arc<AtomicBool>,
    input_sample_rate: u32,
) {
    let mut buffer: Vec<f32> = Vec::new();
    let max_samples = input_sample_rate as u64 * MAX_CAPTURE_SECS;
    let mut limit_reached = false;
    let mut cancelled = false;

    loop {
        match command_rx.try_recv() {
            Ok(CaptureCommand::Stop) => break,
            Ok(CaptureCommand::Cancel) => {
                cancelled = true;
                break;
            }
            Err(TryRecvError::Empty) => {}
            Err(TryRecvError::Disconnected) => break,
        }

        match sample_rx.recv_timeout(Duration::from_millis(50)) {
            Ok(chunk) => {
                let level = rms(&chunk);
                let _ = level_tx.send(level);
                buffer.extend_from_slice(&chunk);
                if buffer.len() as u64 >= max_samples {
                    limit_reached = true;
                    break;
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                if overrun.load(Ordering::Relaxed) {
                    let _ = outcome_tx.send(CaptureOutcome::Failed(
                        "audio buffer overrun: worker could not keep up with capture".into(),
                    ));
                    return;
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }

    if cancelled {
        let _ = outcome_tx.send(CaptureOutcome::Cancelled);
        return;
    }

    let duration_ms = buffer.len() as u64 * 1000 / input_sample_rate.max(1) as u64;
    let samples = resample_linear(&buffer, input_sample_rate, OUTPUT_SAMPLE_RATE);
    let _ = outcome_tx.send(CaptureOutcome::Stopped {
        samples,
        duration_ms,
        limit_reached,
    });
}

fn rms(chunk: &[f32]) -> f32 {
    if chunk.is_empty() {
        return 0.0;
    }
    let sum_squares: f32 = chunk.iter().map(|sample| sample * sample).sum();
    (sum_squares / chunk.len() as f32).sqrt()
}

/// One-shot linear resample, run once on the full buffer at stop time rather
/// than per audio callback. Simpler and safer than streaming resampling with
/// phase tracking; good enough until the spike shows it isn't (see approach
/// doc section 3, "resampling").
fn resample_linear(input: &[f32], input_rate: u32, output_rate: u32) -> Vec<f32> {
    if input.is_empty() || input_rate == output_rate {
        return input.to_vec();
    }

    let ratio = input_rate as f64 / output_rate as f64;
    let output_len = (input.len() as f64 / ratio).floor() as usize;
    (0..output_len)
        .map(|i| {
            let src_pos = i as f64 * ratio;
            let idx = src_pos.floor() as usize;
            let frac = (src_pos - idx as f64) as f32;
            let a = input[idx.min(input.len() - 1)];
            let b = input[(idx + 1).min(input.len() - 1)];
            a + (b - a) * frac
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_linear_keeps_length_when_rates_match() {
        let input = vec![0.1, 0.2, 0.3, 0.4];
        let output = resample_linear(&input, 16_000, 16_000);
        assert_eq!(output, input);
    }

    #[test]
    fn resample_linear_halves_length_when_input_rate_doubles_output_rate() {
        let input: Vec<f32> = (0..100).map(|i| i as f32).collect();
        let output = resample_linear(&input, 32_000, 16_000);
        assert_eq!(output.len(), 50);
    }

    #[test]
    fn resample_linear_handles_empty_input() {
        let output = resample_linear(&[], 44_100, 16_000);
        assert!(output.is_empty());
    }

    #[test]
    fn rms_of_silence_is_zero() {
        assert_eq!(rms(&[0.0, 0.0, 0.0]), 0.0);
    }

    #[test]
    fn rms_of_constant_signal_matches_its_amplitude() {
        let value = rms(&[0.5, 0.5, 0.5, 0.5]);
        assert!((value - 0.5).abs() < 1e-6);
    }

    #[test]
    fn downmix_averages_interleaved_channels() {
        // Two frames, stereo: (1.0, 3.0) and (2.0, 4.0) -> mono (2.0, 3.0)
        let stereo = vec![1.0, 3.0, 2.0, 4.0];
        assert_eq!(downmix(&stereo, 2), vec![2.0, 3.0]);
    }

    #[test]
    fn downmix_is_a_no_op_for_mono_input() {
        let mono = vec![0.1, 0.2, 0.3];
        assert_eq!(downmix(&mono, 1), mono);
    }
}

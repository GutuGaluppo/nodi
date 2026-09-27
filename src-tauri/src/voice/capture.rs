use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, TryRecvError};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;

/// Hard cap on a single recording: one hour, long enough for a meeting
/// (VOICE-AUD-003). Audio is resampled to 16 kHz while recording and kept as
/// 16-bit samples, so an hour costs about 115 MB instead of the ~690 MB a
/// 48 kHz `f32` buffer would need.
pub const MAX_CAPTURE_SECS: u64 = 3_600;

/// Target sample rate the transcription engine expects.
pub const OUTPUT_SAMPLE_RATE: u32 = 16_000;

pub enum CaptureCommand {
    Stop,
    Cancel,
}

pub enum CaptureOutcome {
    /// 16 kHz mono samples.
    Stopped {
        samples: Vec<i16>,
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
    let mut buffer: Vec<i16> = Vec::new();
    let mut resampler = StreamingResampler::new(input_sample_rate, OUTPUT_SAMPLE_RATE);
    let max_samples = OUTPUT_SAMPLE_RATE as u64 * MAX_CAPTURE_SECS;
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
                resampler.push(&chunk, &mut buffer);
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

    resampler.finish(&mut buffer);
    let duration_ms = buffer.len() as u64 * 1000 / OUTPUT_SAMPLE_RATE as u64;
    let _ = outcome_tx.send(CaptureOutcome::Stopped {
        samples: buffer,
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

/// Linear resampler that works on the stream chunk by chunk, carrying the
/// last sample across chunk boundaries so the output is continuous. Resampling
/// while recording keeps memory proportional to 16 kHz audio rather than to
/// the device's native rate.
pub struct StreamingResampler {
    step: f64,
    /// Position of the next output sample, relative to `carry` (index 0) when
    /// there is one, or to the start of the next chunk otherwise.
    next: f64,
    carry: Option<f32>,
}

impl StreamingResampler {
    pub fn new(input_rate: u32, output_rate: u32) -> Self {
        Self {
            step: input_rate.max(1) as f64 / output_rate.max(1) as f64,
            next: 0.0,
            carry: None,
        }
    }

    pub fn push(&mut self, chunk: &[f32], out: &mut Vec<i16>) {
        if chunk.is_empty() {
            return;
        }
        let carry = self.carry;
        let offset = usize::from(carry.is_some());
        let len = chunk.len() + offset;
        let sample = |index: usize| -> f32 {
            match carry {
                Some(value) if index == 0 => value,
                _ => chunk[index - offset],
            }
        };
        while self.next + 1.0 < len as f64 {
            let index = self.next.floor() as usize;
            let frac = (self.next - index as f64) as f32;
            let a = sample(index);
            let b = sample(index + 1);
            out.push(to_i16(a + (b - a) * frac));
            self.next += self.step;
        }
        self.carry = Some(sample(len - 1));
        self.next -= (len - 1) as f64;
    }

    /// Emits the final carried sample when the stream ends exactly on it.
    pub fn finish(&mut self, out: &mut Vec<i16>) {
        if let Some(last) = self.carry.take() {
            if self.next <= 0.0 {
                out.push(to_i16(last));
            }
        }
    }
}

fn to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resample(chunks: &[&[f32]], input_rate: u32, output_rate: u32) -> Vec<i16> {
        let mut resampler = StreamingResampler::new(input_rate, output_rate);
        let mut out = Vec::new();
        for chunk in chunks {
            resampler.push(chunk, &mut out);
        }
        resampler.finish(&mut out);
        out
    }

    #[test]
    fn resampler_keeps_every_sample_when_rates_match() {
        let output = resample(&[&[0.1, 0.2], &[0.3, 0.4]], 16_000, 16_000);
        assert_eq!(output, vec![3277, 6553, 9830, 13107]);
    }

    #[test]
    fn resampler_halves_length_when_input_rate_doubles_output_rate() {
        let input: Vec<f32> = (0..100).map(|i| i as f32 / 100.0).collect();
        let output = resample(&[&input[..37], &input[37..]], 32_000, 16_000);
        assert_eq!(output.len(), 50);
    }

    #[test]
    fn resampler_output_does_not_depend_on_chunk_boundaries() {
        let input: Vec<f32> = (0..480).map(|i| (i as f32 / 40.0).sin() * 0.5).collect();
        let whole = resample(&[&input], 48_000, 16_000);
        let split = resample(&[&input[..101], &input[101..333], &input[333..]], 48_000, 16_000);
        assert_eq!(whole, split);
        assert_eq!(whole.len(), 160);
    }

    #[test]
    fn resampler_handles_empty_input() {
        assert!(resample(&[&[]], 44_100, 16_000).is_empty());
    }

    #[test]
    fn samples_are_clamped_to_16_bit_range() {
        assert_eq!(to_i16(2.0), i16::MAX);
        assert_eq!(to_i16(-2.0), -i16::MAX);
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

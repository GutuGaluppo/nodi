use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::capture::{self, CaptureOutcome, MAX_CAPTURE_SECS};
use super::engine::{EngineError, Language, TranscriptionEngine};
use super::engine_fake::PlaceholderEngine;
use super::engine_whisper::WhisperEngine;
use super::events::{
    CompletedPayload, FailedPayload, LevelPayload, StatePayload, EVENT_COMPLETED, EVENT_FAILED,
    EVENT_LEVEL, EVENT_STATE,
};
use super::session::{new_session_id, ActiveSession, SessionPhase, VoiceState};

/// Model file name expected under the app's data directory (see
/// `resolve_model_path`). Matches docs/VOICE_TRANSCRIPTION_APPROACH.md's
/// "modelo bundled" decision: one fixed multilingual model, no manifest or
/// version selection in the MVP.
const MODEL_FILE_NAME: &str = "ggml-base.bin";

/// Caches the loaded `whisper.cpp` model across sessions within the same app
/// run, since loading it is the expensive part (decision #14: load on first
/// "Parar", reuse afterwards). Empty when no model file is present yet — in
/// that case there is nothing expensive to cache, so `PlaceholderEngine` is
/// constructed fresh every time.
#[derive(Default)]
pub struct EngineCache(Mutex<Option<Arc<dyn TranscriptionEngine>>>);

#[derive(Debug, Serialize)]
#[serde(tag = "code", content = "message", rename_all = "camelCase")]
pub enum VoiceCommandError {
    SessionAlreadyActive,
    StaleSession,
    DeviceUnavailable(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartedSession {
    pub session_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionCapabilities {
    pub max_duration_secs: u64,
    pub supported_languages: Vec<&'static str>,
    pub engine_ready: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub status: &'static str,
}

#[tauri::command]
pub fn get_transcription_capabilities(app: AppHandle) -> TranscriptionCapabilities {
    TranscriptionCapabilities {
        max_duration_secs: MAX_CAPTURE_SECS,
        supported_languages: vec!["auto", "pt-BR", "pt-PT", "en"],
        engine_ready: resolve_model_path(&app).is_some(),
    }
}

#[tauri::command]
pub fn get_transcription_model_status(app: AppHandle) -> ModelStatus {
    ModelStatus {
        status: if resolve_model_path(&app).is_some() {
            "ready"
        } else {
            "placeholder"
        },
    }
}

/// Where the bundled/downloaded model is expected to live: the app's data
/// directory, never inside SQLite or the app bundle's read-only resources.
/// Returns `None` when no file exists there yet, which today just means the
/// Fase 1 spike hasn't placed one — not an error.
fn resolve_model_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let path = dir.join("models").join(MODEL_FILE_NAME);
    path.is_file().then_some(path)
}

/// Resolves the engine to use for one transcription: the cached real model
/// if it was already loaded, a freshly loaded one if the model file exists
/// but hasn't been loaded this run, or the placeholder if no model file is
/// present. Loading is blocking (file IO plus model parsing) and must only
/// be called from a blocking context.
fn resolve_engine(
    app: &AppHandle,
    cache: &EngineCache,
) -> Result<Arc<dyn TranscriptionEngine>, EngineError> {
    let mut guard = cache.0.lock().unwrap();
    if let Some(engine) = guard.as_ref() {
        return Ok(engine.clone());
    }

    match resolve_model_path(app) {
        Some(path) => {
            let engine: Arc<dyn TranscriptionEngine> = Arc::new(WhisperEngine::load(&path)?);
            *guard = Some(engine.clone());
            Ok(engine)
        }
        None => Ok(Arc::new(PlaceholderEngine)),
    }
}

#[tauri::command]
pub fn start_voice_capture(
    note_id: String,
    language: String,
    app: AppHandle,
    state: State<'_, VoiceState>,
) -> Result<StartedSession, VoiceCommandError> {
    let mut guard = state.0.lock().unwrap();
    if guard.is_some() {
        return Err(VoiceCommandError::SessionAlreadyActive);
    }

    let channels = capture::start().map_err(|err| VoiceCommandError::DeviceUnavailable(err.to_string()))?;
    let session_id = new_session_id();

    *guard = Some(ActiveSession {
        session_id: session_id.clone(),
        phase: SessionPhase::Recording,
        capture: channels.handle,
    });
    drop(guard);

    emit_state(&app, &session_id, &note_id, SessionPhase::Recording);

    spawn_level_forwarder(app.clone(), session_id.clone(), channels.level_rx);
    spawn_session_watcher(
        app,
        session_id.clone(),
        note_id,
        language,
        channels.outcome_rx,
    );

    Ok(StartedSession { session_id })
}

#[tauri::command]
pub fn stop_voice_capture(
    session_id: String,
    state: State<'_, VoiceState>,
) -> Result<(), VoiceCommandError> {
    let mut guard = state.0.lock().unwrap();
    let session = guard.as_mut().ok_or(VoiceCommandError::StaleSession)?;
    if session.session_id != session_id {
        return Err(VoiceCommandError::StaleSession);
    }

    session.phase = SessionPhase::Stopping;
    session.capture.stop();
    Ok(())
}

#[tauri::command]
pub fn cancel_voice_capture(
    session_id: String,
    state: State<'_, VoiceState>,
) -> Result<(), VoiceCommandError> {
    let mut guard = state.0.lock().unwrap();
    let session = guard.as_mut().ok_or(VoiceCommandError::StaleSession)?;
    if session.session_id != session_id {
        return Err(VoiceCommandError::StaleSession);
    }

    session.phase = SessionPhase::Cancelling;
    session.capture.cancel();
    Ok(())
}

fn emit_state(app: &AppHandle, session_id: &str, note_id: &str, phase: SessionPhase) {
    let _ = app.emit(
        EVENT_STATE,
        StatePayload {
            session_id: session_id.to_string(),
            note_id: note_id.to_string(),
            phase: phase.as_str().to_string(),
        },
    );
}

fn spawn_level_forwarder(
    app: AppHandle,
    session_id: String,
    level_rx: std::sync::mpsc::Receiver<f32>,
) {
    thread::spawn(move || {
        while let Ok(level) = level_rx.recv() {
            let _ = app.emit(
                EVENT_LEVEL,
                LevelPayload {
                    session_id: session_id.clone(),
                    level,
                },
            );
        }
    });
}

fn spawn_session_watcher(
    app: AppHandle,
    session_id: String,
    note_id: String,
    language: String,
    outcome_rx: std::sync::mpsc::Receiver<CaptureOutcome>,
) {
    tauri::async_runtime::spawn(async move {
        let outcome = tauri::async_runtime::spawn_blocking(move || outcome_rx.recv())
            .await
            .ok()
            .and_then(|result| result.ok());

        match outcome {
            Some(CaptureOutcome::Cancelled) => {
                emit_state(&app, &session_id, &note_id, SessionPhase::Cancelling);
                clear_session(&app, &session_id);
            }
            Some(CaptureOutcome::Failed(message)) => {
                emit_failed(&app, &session_id, &note_id, "capture-failed", &message);
                clear_session(&app, &session_id);
            }
            Some(CaptureOutcome::Stopped {
                samples,
                duration_ms,
                limit_reached,
            }) => {
                emit_state(&app, &session_id, &note_id, SessionPhase::Transcribing);
                let lang = Language::from_code(&language);
                let app_for_engine = app.clone();
                let result = tauri::async_runtime::spawn_blocking(move || {
                    let cache = app_for_engine.state::<EngineCache>();
                    let engine = resolve_engine(&app_for_engine, &cache)?;
                    engine.transcribe(&samples, lang)
                })
                .await
                .ok();

                match result {
                    Some(Ok(output)) => {
                        let _ = app.emit(
                            EVENT_COMPLETED,
                            CompletedPayload {
                                session_id: session_id.clone(),
                                note_id: note_id.clone(),
                                language: language.clone(),
                                text: output.text,
                                duration_ms,
                                segments: output.segments,
                                limit_reached,
                            },
                        );
                    }
                    Some(Err(EngineError::EmptyAudio)) => {
                        emit_failed(&app, &session_id, &note_id, "empty-audio", "no speech captured");
                    }
                    Some(Err(EngineError::Failed(message))) => {
                        emit_failed(&app, &session_id, &note_id, "engine-failed", &message);
                    }
                    None => {
                        emit_failed(
                            &app,
                            &session_id,
                            &note_id,
                            "engine-failed",
                            "transcription task did not complete",
                        );
                    }
                }
                clear_session(&app, &session_id);
            }
            None => {
                emit_failed(
                    &app,
                    &session_id,
                    &note_id,
                    "capture-failed",
                    "capture worker ended unexpectedly",
                );
                clear_session(&app, &session_id);
            }
        }
    });
}

fn emit_failed(app: &AppHandle, session_id: &str, note_id: &str, code: &str, message: &str) {
    let _ = app.emit(
        EVENT_FAILED,
        FailedPayload {
            session_id: session_id.to_string(),
            note_id: note_id.to_string(),
            code: code.to_string(),
            message: message.to_string(),
        },
    );
}

/// Clears the active session only if it is still the one that just finished
/// — guards against a stale watcher clearing a session that a newer
/// `start_voice_capture` call has since replaced.
fn clear_session(app: &AppHandle, session_id: &str) {
    let state = app.state::<VoiceState>();
    let mut guard = state.0.lock().unwrap();
    if guard.as_ref().is_some_and(|session| session.session_id == session_id) {
        *guard = None;
    }
}

mod migrations;
mod voice;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(migrations::DATABASE_URL, migrations::all())
                .build(),
        )
        .manage(voice::VoiceState::default())
        .manage(voice::EngineCache::default())
        .invoke_handler(tauri::generate_handler![
            voice::commands::get_transcription_capabilities,
            voice::commands::get_transcription_model_status,
            voice::commands::start_voice_capture,
            voice::commands::stop_voice_capture,
            voice::commands::cancel_voice_capture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

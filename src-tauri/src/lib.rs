mod attachments;
mod migrations;
mod mirror;
mod voice;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(migrations::DATABASE_URL, migrations::all())
                .build(),
        )
        .setup(|app| {
            // Recordings the user never kept belong to a previous run.
            if let Ok(root) = attachments::root(app.handle()) {
                let _ = attachments::clear_staging(&root);
            }
            Ok(())
        })
        .manage(voice::VoiceState::default())
        .manage(voice::EngineCache::default())
        .invoke_handler(tauri::generate_handler![
            voice::commands::get_transcription_capabilities,
            voice::commands::get_transcription_model_status,
            voice::commands::start_voice_capture,
            voice::commands::stop_voice_capture,
            voice::commands::cancel_voice_capture,
            attachments::keep_voice_recording,
            attachments::discard_voice_recording,
            attachments::sweep_attachments,
            mirror::get_mirror_folder,
            mirror::choose_mirror_folder,
            mirror::clear_mirror_folder,
            mirror::write_mirror,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

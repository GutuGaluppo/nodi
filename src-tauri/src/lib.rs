mod attachments;
mod embeddings;
mod migrations;
mod mirror;
mod ocr;
mod quick_capture;
mod spotlight;
mod touch_id;
mod voice;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(quick_capture::shortcut_plugin())
        .plugin(tauri_plugin_deep_link::init())
        .manage(quick_capture::PendingCaptures::default())
        .manage(spotlight::PendingOpen::default())
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
            quick_capture::setup(app.handle())?;
            spotlight::setup(app.handle());
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
            attachments::import_image_bytes,
            attachments::import_image_files,
            attachments::pick_image_files,
            ocr::recognize_attachment_text,
            embeddings::embed_notes,
            quick_capture::take_pending_captures,
            spotlight::spotlight_replace_notes,
            spotlight::spotlight_clear,
            spotlight::take_pending_open,
            touch_id::touch_id_support,
            touch_id::touch_id_seal,
            touch_id::touch_id_unseal,
            mirror::get_mirror_folder,
            mirror::choose_mirror_folder,
            mirror::clear_mirror_folder,
            mirror::write_mirror,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod migrations;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(migrations::DATABASE_URL, migrations::all())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

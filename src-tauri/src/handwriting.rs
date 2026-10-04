//! Local export of reviewed provider text, and opening the purchase channel.
//! No provider credential is kept here.
use std::{fs, path::Path};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

fn write_text(path: &Path, text: &str) -> Result<(), String> {
    if text.len() > 10_000_000 {
        return Err("the transcription is too large to export".into());
    }
    fs::write(path, text.as_bytes()).map_err(|_| "could not save the transcription".into())
}

#[tauri::command]
pub async fn export_handwriting_text(app: AppHandle, text: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .set_title("Export transcription")
            .set_file_name("nodi-transcription.txt")
            .add_filter("Text", &["txt"])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = file
            .into_path()
            .map_err(|_| "invalid export location".to_string())?;
        write_text(&path, &text)?;
        Ok(true)
    })
    .await
    .map_err(|_| "could not open the export dialog".to_string())?
}

/// Only a plain HTTPS address, so the purchase channel cannot become a local
/// file, another scheme, or an extra argument to `open`.
fn checkout_address(url: &str) -> Option<&str> {
    let host = url.strip_prefix("https://")?.split(['/', '?', '#']).next()?;
    let valid = url.len() <= 2048
        && !host.is_empty()
        && !host.contains('@')
        && url.chars().all(|c| c.is_ascii_graphic());
    valid.then_some(url)
}

/// Opens the checkout or subscription page returned by the authenticated
/// backend in the default browser; the webview does not open new windows.
#[tauri::command]
pub fn open_handwriting_checkout(url: String) -> Result<(), String> {
    let address = checkout_address(&url).ok_or("invalid purchase address")?;
    std::process::Command::new("/usr/bin/open")
        .arg(address)
        .status()
        .map_err(|_| "could not open the purchase page".to_string())?
        .success()
        .then_some(())
        .ok_or_else(|| "could not open the purchase page".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_only_plain_https_purchase_addresses() {
        let page = "https://pay.example.com/checkout/abc?session=1";
        assert_eq!(checkout_address(page), Some(page));
        for refused in [
            "http://pay.example.com",
            "file:///etc/passwd",
            "-a Terminal",
            "https://",
            "https://user@evil.example",
            "https://pay.example.com/ space",
            "https://pay.example.com/\nline",
        ] {
            assert_eq!(checkout_address(refused), None, "{refused}");
        }
    }

    #[test]
    fn exported_transcription_keeps_unicode_spacing_and_words_exactly() {
        let path =
            std::env::temp_dir().join(format!("nodi-transcription-{}.txt", std::process::id()));
        let text = "  Grap conpilence\n\nOlá 世界\n";
        write_text(&path, text).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), text);
        fs::remove_file(path).unwrap();
    }
}

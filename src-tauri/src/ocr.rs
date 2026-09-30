//! On-device text recognition for images (OCR-001, OCR-003), using Apple's
//! Vision framework through `native/TextReader.swift`. Nothing leaves the
//! Mac; recognition runs in this process.

use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::attachments::ATTACHMENTS_DIR;
use crate::text_layout::{layout, Line};

/// A word the Mac's spell checker does not know, with its guesses.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DoubtfulWord {
    pub word: String,
    pub suggestions: Vec<String>,
}

/// The text read from an image, for review before it becomes a note.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageText {
    /// Blocks separated by a blank line; `- ` starts a list item.
    pub text: String,
    /// Words that were probably misread.
    pub doubtful_words: Vec<DoubtfulWord>,
}

#[cfg(target_os = "macos")]
mod native {
    use std::ffi::{c_char, CStr, CString};

    use serde::Deserialize;

    use super::DoubtfulWord;
    use crate::text_layout::Line;

    extern "C" {
        fn nodi_text_read(path: *const c_char, out: *mut *mut c_char) -> i32;
        fn nodi_text_check_spelling(text: *const c_char, out: *mut *mut c_char) -> i32;
        fn nodi_text_free(text: *mut c_char);
    }

    #[derive(Deserialize)]
    struct Reading {
        lines: Vec<Line>,
    }

    /// Takes ownership of a string the Swift side allocated with `strdup`.
    unsafe fn take(text: *mut c_char) -> String {
        if text.is_null() {
            return String::new();
        }
        let value = CStr::from_ptr(text).to_string_lossy().into_owned();
        nodi_text_free(text);
        value
    }

    fn call(
        input: &str,
        function: unsafe extern "C" fn(*const c_char, *mut *mut c_char) -> i32,
    ) -> Result<String, String> {
        let input = CString::new(input).map_err(|_| "unexpected NUL byte".to_string())?;
        let mut out = std::ptr::null_mut();
        // SAFETY: a valid C string in, and `out` receives a string we free.
        let (code, text) = unsafe {
            let code = function(input.as_ptr(), &mut out);
            (code, take(out))
        };
        if code == 0 {
            Ok(text)
        } else {
            Err(text)
        }
    }

    pub fn read(path: &str) -> Result<Vec<Line>, String> {
        let json = call(path, nodi_text_read)?;
        serde_json::from_str::<Reading>(&json)
            .map(|reading| reading.lines)
            .map_err(|err| err.to_string())
    }

    /// Uses AppKit's spell checker: call it on the main thread in the app.
    pub fn check_spelling(text: &str) -> Result<Vec<DoubtfulWord>, String> {
        let json = call(text, nodi_text_check_spelling)?;
        serde_json::from_str(&json).map_err(|err| err.to_string())
    }
}

/// Recognizes the text in an image file, laid out in rows and blocks.
#[cfg(target_os = "macos")]
pub fn recognize_text(path: &Path) -> Result<String, String> {
    let lines: Vec<Line> = native::read(&path.to_string_lossy())?;
    Ok(layout(&lines))
}

#[cfg(not(target_os = "macos"))]
pub fn recognize_text(_path: &Path) -> Result<String, String> {
    Err("text recognition is only available on macOS".into())
}

#[cfg(target_os = "macos")]
fn doubtful_words(app: &AppHandle, text: String) -> Vec<DoubtfulWord> {
    let (sender, receiver) = std::sync::mpsc::channel();
    let scheduled = app.run_on_main_thread(move || {
        let _ = sender.send(native::check_spelling(&text));
    });
    match scheduled.map(|()| receiver.recv()) {
        Ok(Ok(Ok(words))) => words,
        _ => Vec::new(),
    }
}

#[cfg(not(target_os = "macos"))]
fn doubtful_words(_app: &AppHandle, _text: String) -> Vec<DoubtfulWord> {
    Vec::new()
}

/// Resolves a stored attachment path, refusing anything outside the
/// attachments directory.
fn resolve_attachment(app_data: &Path, relative: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(relative);
    let mut components = candidate.components();
    let first_is_root =
        matches!(components.next(), Some(Component::Normal(name)) if name == ATTACHMENTS_DIR);
    let rest_is_plain = components.all(|component| matches!(component, Component::Normal(_)));
    if !first_is_root || !rest_is_plain {
        return Err("invalid attachment path".into());
    }
    Ok(app_data.join(candidate))
}

/// Recognizes the text in a stored image attachment.
#[tauri::command]
pub async fn recognize_attachment_text(
    app: AppHandle,
    relative_path: String,
) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|err| err.to_string())?;
    let path = resolve_attachment(&app_data, &relative_path)?;
    tauri::async_runtime::spawn_blocking(move || recognize_text(&path))
        .await
        .map_err(|err| err.to_string())?
}

/// Recognizes the text in a stored image, with the words that were probably
/// misread, for review before it becomes a note (OCR-003).
#[tauri::command]
pub async fn read_image_text(app: AppHandle, relative_path: String) -> Result<ImageText, String> {
    let app_data = app.path().app_data_dir().map_err(|err| err.to_string())?;
    let path = resolve_attachment(&app_data, &relative_path)?;
    let text = tauri::async_runtime::spawn_blocking(move || recognize_text(&path))
        .await
        .map_err(|err| err.to_string())??;
    let checker = app.clone();
    let spelling = text.clone();
    let doubtful_words =
        tauri::async_runtime::spawn_blocking(move || doubtful_words(&checker, spelling))
            .await
            .unwrap_or_default();
    Ok(ImageText {
        text,
        doubtful_words,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_only_paths_inside_attachments() {
        let app_data = Path::new("/data");
        assert_eq!(
            resolve_attachment(app_data, "attachments/ab/abc/image.png").unwrap(),
            PathBuf::from("/data/attachments/ab/abc/image.png")
        );
        for bad in [
            "attachments/../nodi.db",
            "../attachments/x.png",
            "/etc/passwd",
            "other/ab/x.png",
            "",
        ] {
            assert!(
                resolve_attachment(app_data, bad).is_err(),
                "{bad} should be refused"
            );
        }
    }

    #[cfg(target_os = "macos")]
    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn recognizes_the_text_in_a_receipt_image() {
        let text = recognize_text(&fixture("ocr-receipt.png")).expect("Vision should read it");

        let lowered = text.to_lowercase();
        assert!(lowered.contains("lisbon bakery"), "recognized: {text}");
        assert!(lowered.contains("pastel de nata"), "recognized: {text}");
        assert!(text.contains("12.40"), "recognized: {text}");
        // Each price stays on its item's row.
        assert!(
            text.lines()
                .any(|row| row.contains("Pastel de nata") && row.contains("3.20")),
            "recognized: {text}"
        );
    }

    /// Two handwritten sticky notes, photographed with an iPhone.
    #[cfg(target_os = "macos")]
    #[test]
    fn reads_handwritten_notes() {
        let text =
            recognize_text(&fixture("ocr-handwritten-notes.jpg")).expect("Vision should read it");

        for expected in ["Cadence - audio", "click do botão", "\"Quit\""] {
            assert!(text.contains(expected), "missing {expected} in: {text}");
        }
        // "Close" was written beside "com "Quit"", on the same row.
        assert!(
            text.lines()
                .any(|row| row.contains("Quit") && row.contains("Close")),
            "recognized: {text}"
        );
        // Vision once read "o tempo" as Cyrillic.
        assert!(
            !text.chars().any(|c| ('\u{0400}'..='\u{04FF}').contains(&c)),
            "recognized: {text}"
        );
        assert!(text.contains("\n\n"), "no blocks in: {text}");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn points_out_misread_words_with_suggestions() {
        let words = native::check_spelling(
            "Logo pulsando se estier ativo, click com Quit. Barra de manus, barra de menus",
        )
        .expect("the spell checker should run");

        let estier = words
            .iter()
            .find(|word| word.word == "estier")
            .expect("estier is not Portuguese");
        assert!(estier.suggestions.contains(&"estiver".to_string()));
        // Words that are English are not doubtful...
        assert!(words
            .iter()
            .all(|word| word.word != "click" && word.word != "Quit"));
        // ...unless a suggestion is written elsewhere in the text.
        assert!(words.iter().any(|word| word.word == "manus"), "{words:?}");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reports_a_missing_image() {
        assert!(recognize_text(Path::new("/nonexistent/image.png")).is_err());
    }
}

//! On-device text recognition for images (OCR-001, OCR-003), using Apple's
//! Vision framework through `native/TextReader.swift`. Nothing leaves the
//! Mac; recognition runs in this process.

use std::collections::HashMap;
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

/// Other readings Vision had for the words it read, by word.
pub type Variants = HashMap<String, Vec<String>>;

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

    use serde::{Deserialize, Serialize};

    use super::{DoubtfulWord, Variants};
    use crate::text_layout::Line;

    extern "C" {
        fn nodi_text_read(path: *const c_char, out: *mut *mut c_char) -> i32;
        fn nodi_text_check_spelling(text: *const c_char, out: *mut *mut c_char) -> i32;
        fn nodi_text_free(text: *mut c_char);
    }

    #[derive(Deserialize)]
    struct ReadLine {
        #[serde(flatten)]
        line: Line,
        #[serde(default)]
        variants: Variants,
    }

    #[derive(Deserialize)]
    struct Reading {
        lines: Vec<ReadLine>,
    }

    #[derive(Serialize)]
    struct SpellingInput<'a> {
        text: &'a str,
        variants: &'a Variants,
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

    /// The lines read, and the other readings of their words.
    pub fn read(path: &str) -> Result<(Vec<Line>, Variants), String> {
        let json = call(path, nodi_text_read)?;
        let reading = serde_json::from_str::<Reading>(&json).map_err(|err| err.to_string())?;
        let mut variants = Variants::new();
        let lines = reading
            .lines
            .into_iter()
            .map(|read| {
                for (word, others) in read.variants {
                    let known = variants.entry(word).or_default();
                    for other in others {
                        if !known.contains(&other) {
                            known.push(other);
                        }
                    }
                }
                read.line
            })
            .collect();
        Ok((lines, variants))
    }

    /// Uses AppKit's spell checker: call it on the main thread in the app.
    pub fn check_spelling(text: &str, variants: &Variants) -> Result<Vec<DoubtfulWord>, String> {
        let input = serde_json::to_string(&SpellingInput { text, variants })
            .map_err(|err| err.to_string())?;
        let json = call(&input, nodi_text_check_spelling)?;
        serde_json::from_str(&json).map_err(|err| err.to_string())
    }
}

/// Recognizes the text in an image file, laid out in rows and blocks.
#[cfg(target_os = "macos")]
pub fn recognize_text(path: &Path) -> Result<String, String> {
    read_text(path).map(|(text, _)| text)
}

#[cfg(not(target_os = "macos"))]
pub fn recognize_text(_path: &Path) -> Result<String, String> {
    Err("text recognition is only available on macOS".into())
}

/// The laid-out text, and the other readings of its words.
#[cfg(target_os = "macos")]
fn read_text(path: &Path) -> Result<(String, Variants), String> {
    let (lines, variants): (Vec<Line>, Variants) = native::read(&path.to_string_lossy())?;
    Ok((layout(&lines), variants))
}

#[cfg(not(target_os = "macos"))]
fn read_text(path: &Path) -> Result<(String, Variants), String> {
    recognize_text(path).map(|text| (text, Variants::new()))
}

#[cfg(target_os = "macos")]
fn doubtful_words(app: &AppHandle, text: String, variants: Variants) -> Vec<DoubtfulWord> {
    let (sender, receiver) = std::sync::mpsc::channel();
    let scheduled = app.run_on_main_thread(move || {
        let _ = sender.send(native::check_spelling(&text, &variants));
    });
    match scheduled.map(|()| receiver.recv()) {
        Ok(Ok(Ok(words))) => words,
        _ => Vec::new(),
    }
}

#[cfg(not(target_os = "macos"))]
fn doubtful_words(_app: &AppHandle, _text: String, _variants: Variants) -> Vec<DoubtfulWord> {
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
    let (text, variants) = tauri::async_runtime::spawn_blocking(move || read_text(&path))
        .await
        .map_err(|err| err.to_string())??;
    let checker = app.clone();
    let spelling = text.clone();
    let doubtful_words =
        tauri::async_runtime::spawn_blocking(move || doubtful_words(&checker, spelling, variants))
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
            &Variants::new(),
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

    /// A handwritten list in English, photographed on a desk (OCR-005).
    #[cfg(target_os = "macos")]
    #[test]
    fn suggests_what_a_handwritten_list_says() {
        let (text, variants) =
            read_text(&fixture("ocr-handwritten-list.jpg")).expect("Vision should read it");
        let words = native::check_spelling(&text, &variants).expect("the spell checker should run");
        let first = |misread: &str| {
            words
                .iter()
                .find(|word| word.word == misread)
                .and_then(|word| word.suggestions.first().cloned())
                .unwrap_or_else(|| panic!("{misread} not doubtful in {words:#?}\n{text}"))
        };

        // Guesses in the line's language, not Portuguese ("Lata")...
        assert_eq!(first("Layat"), "Layout");
        assert_eq!(first("doubful"), "doubtful");
        // ...and what the other readings saw in the word's place.
        assert_eq!(first("Grap"), "Group");
        assert_eq!(first("lamework"), "framework");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn suggests_other_readings_of_a_word_first() {
        let variants = Variants::from([(
            "conpilence".to_string(),
            vec!["confidence".to_string(), "conpidence".to_string()],
        )]);
        let words = native::check_spelling("Show conpilence score in review", &variants)
            .expect("the spell checker should run");

        assert_eq!(words.len(), 1, "{words:?}");
        assert_eq!(words[0].suggestions.first().unwrap(), "confidence");
        // An English line gets no Portuguese guesses ("compelindo").
        assert!(
            !words[0]
                .suggestions
                .iter()
                .any(|guess| guess.starts_with("compel")),
            "{words:?}"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reports_a_missing_image() {
        assert!(recognize_text(Path::new("/nonexistent/image.png")).is_err());
    }
}

//! On-device text recognition for images (OCR-001), using Apple's Vision
//! framework. Nothing leaves the Mac; recognition runs in this process.

use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::attachments::ATTACHMENTS_DIR;

/// The text read from an image, with Vision's confidence in it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageText {
    /// One line per recognized line.
    pub text: String,
    /// The mean confidence of the recognized lines, from 0 to 1; 0 when the
    /// image holds no text.
    pub confidence: f32,
}

/// Recognizes the text in an image file, one line per recognized line.
pub fn recognize_text(path: &Path) -> Result<String, String> {
    recognize(path).map(|result| result.text)
}

/// Recognizes the text in an image file, with its confidence.
#[cfg(target_os = "macos")]
pub fn recognize(path: &Path) -> Result<ImageText, String> {
    use objc2::rc::autoreleasepool;
    use objc2::runtime::AnyObject;
    use objc2::AllocAnyThread;
    use objc2_foundation::{NSArray, NSDictionary, NSString, NSURL};
    use objc2_vision::{
        VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
    };

    if !path.is_file() {
        return Err("the image file is missing".into());
    }
    autoreleasepool(|_| {
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
        let options: objc2::rc::Retained<NSDictionary<NSString, AnyObject>> = NSDictionary::new();
        // SAFETY: `options` is an empty dictionary of the documented key and
        // value types, and `url` is a valid file URL.
        let handler = unsafe {
            VNImageRequestHandler::initWithURL_options(
                VNImageRequestHandler::alloc(),
                &url,
                &options,
            )
        };
        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        request.setUsesLanguageCorrection(true);
        request.setAutomaticallyDetectsLanguage(true);
        let as_request: &VNRequest = &request;
        let requests = NSArray::from_slice(&[as_request]);
        handler
            .performRequests_error(&requests)
            .map_err(|error| error.localizedDescription().to_string())?;

        let mut lines = Vec::new();
        let mut confidences = Vec::new();
        if let Some(results) = request.results() {
            for observation in results.iter() {
                if let Some(best) = observation.topCandidates(1).firstObject() {
                    let line = best.string().to_string();
                    if !line.trim().is_empty() {
                        lines.push(line);
                        confidences.push(best.confidence());
                    }
                }
            }
        }
        Ok(ImageText {
            text: lines.join("\n"),
            confidence: mean(&confidences),
        })
    })
}

#[cfg(not(target_os = "macos"))]
pub fn recognize(_path: &Path) -> Result<ImageText, String> {
    Err("text recognition is only available on macOS".into())
}

fn mean(values: &[f32]) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f32>() / values.len() as f32
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

/// Recognizes the text in a stored image, with its confidence, for review
/// before it becomes a note (OCR-003).
#[tauri::command]
pub async fn read_image_text(app: AppHandle, relative_path: String) -> Result<ImageText, String> {
    let app_data = app.path().app_data_dir().map_err(|err| err.to_string())?;
    let path = resolve_attachment(&app_data, &relative_path)?;
    tauri::async_runtime::spawn_blocking(move || recognize(&path))
        .await
        .map_err(|err| err.to_string())?
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
    #[test]
    fn recognizes_the_text_in_a_receipt_image() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ocr-receipt.png");

        let text = recognize_text(&fixture).expect("Vision should read the fixture");

        let lowered = text.to_lowercase();
        assert!(lowered.contains("lisbon bakery"), "recognized: {text}");
        assert!(lowered.contains("pastel de nata"), "recognized: {text}");
        assert!(text.contains("12.40"), "recognized: {text}");
    }

    #[test]
    fn averages_line_confidence() {
        assert_eq!(mean(&[]), 0.0);
        assert!((mean(&[1.0, 0.5]) - 0.75).abs() < f32::EPSILON);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reports_confidence_for_the_receipt() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ocr-receipt.png");

        let result = recognize(&fixture).expect("Vision should read the fixture");

        assert!(result.text.to_lowercase().contains("lisbon bakery"));
        assert!(
            result.confidence > 0.5 && result.confidence <= 1.0,
            "confidence: {}",
            result.confidence
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reports_a_missing_image() {
        assert!(recognize_text(Path::new("/nonexistent/image.png")).is_err());
    }
}

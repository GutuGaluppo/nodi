//! File storage for attachments (ATT-001). Binary content never goes into
//! SQLite: files live under `<app data>/attachments/<prefix>/<sha256>/<name>`
//! and the database keeps only their metadata (ATT-002, in the frontend).
//!
//! Voice recordings are first written to `attachments/.staging/<session>.wav`
//! when a dictation stops. They move into permanent storage only if the user
//! keeps them; otherwise they are deleted, and anything left in staging is
//! cleared at the next launch.

use std::collections::HashSet;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

pub const ATTACHMENTS_DIR: &str = "attachments";
const STAGING_DIR: &str = ".staging";
const RECORDING_FILE_NAME: &str = "recording.wav";
/// Largest image NODI will import (ATT-003).
pub const MAX_IMAGE_BYTES: u64 = 50 * 1024 * 1024;

static IMPORT_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredAttachment {
    /// Relative to the app data directory, e.g. `attachments/ab/abcd…/recording.wav`.
    pub relative_path: String,
    pub sha256: String,
    pub size: u64,
    pub filename: String,
    pub mime_type: String,
}

pub fn root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(ATTACHMENTS_DIR))
        .map_err(|err| err.to_string())
}

/// Session ids come from `voice::session::new_session_id`; anything else is
/// refused so a caller can never reach outside the staging directory.
fn is_valid_session_id(session_id: &str) -> bool {
    !session_id.is_empty()
        && session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn staged_recording(root: &Path, session_id: &str) -> Result<PathBuf, String> {
    if !is_valid_session_id(session_id) {
        return Err("invalid session id".into());
    }
    Ok(root.join(STAGING_DIR).join(format!("{session_id}.wav")))
}

/// Writes 16-bit mono PCM samples as a WAV file.
pub fn write_wav(path: &Path, samples: &[i16], sample_rate: u32) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec).map_err(|err| err.to_string())?;
    for sample in samples {
        writer
            .write_sample(*sample)
            .map_err(|err| err.to_string())?;
    }
    writer.finalize().map_err(|err| err.to_string())
}

/// Stages a finished recording so the user can decide whether to keep it.
pub fn stage_recording(
    root: &Path,
    session_id: &str,
    samples: &[i16],
    sample_rate: u32,
) -> Result<(), String> {
    write_wav(&staged_recording(root, session_id)?, samples, sample_rate)
}

fn sha256_of(path: &Path) -> io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

/// Moves `source` into content-addressed storage. Identical content is stored
/// once; the duplicate source is removed.
pub fn store_file(
    root: &Path,
    source: &Path,
    filename: &str,
    mime_type: &str,
) -> io::Result<StoredAttachment> {
    let sha256 = sha256_of(source)?;
    let size = fs::metadata(source)?.len();
    let prefix = &sha256[..2];
    let directory = root.join(prefix).join(&sha256);
    fs::create_dir_all(&directory)?;
    let destination = directory.join(filename);
    if destination.exists() {
        fs::remove_file(source)?;
    } else if fs::rename(source, &destination).is_err() {
        fs::copy(source, &destination)?;
        fs::remove_file(source)?;
    }
    Ok(StoredAttachment {
        relative_path: format!("{ATTACHMENTS_DIR}/{prefix}/{sha256}/{filename}"),
        sha256,
        size,
        filename: filename.to_string(),
        mime_type: mime_type.to_string(),
    })
}

/// Deletes stored files that no attachment record references, then any
/// directories left empty. `keep` holds relative paths as stored in SQLite.
/// Returns how many files were deleted. Staging is left alone.
pub fn sweep(root: &Path, keep: &HashSet<String>) -> io::Result<usize> {
    fn visit(
        dir: &Path,
        root: &Path,
        keep: &HashSet<String>,
        removed: &mut usize,
    ) -> io::Result<()> {
        for entry in fs::read_dir(dir)? {
            let path = entry?.path();
            if path.is_dir() {
                if dir == root && path.file_name().is_some_and(|name| name == STAGING_DIR) {
                    continue;
                }
                visit(&path, root, keep, removed)?;
                if fs::read_dir(&path)?.next().is_none() {
                    fs::remove_dir(&path)?;
                }
            } else {
                let relative = path
                    .strip_prefix(root)
                    .map(|rest| format!("{ATTACHMENTS_DIR}/{}", rest.to_string_lossy()))
                    .unwrap_or_default();
                if !keep.contains(&relative) {
                    fs::remove_file(&path)?;
                    *removed += 1;
                }
            }
        }
        Ok(())
    }

    if !root.exists() {
        return Ok(0);
    }
    let mut removed = 0;
    visit(root, root, keep, &mut removed)?;
    Ok(removed)
}

/// Removes recordings left in staging by a previous run.
pub fn clear_staging(root: &Path) -> io::Result<()> {
    let staging = root.join(STAGING_DIR);
    if staging.exists() {
        fs::remove_dir_all(staging)?;
    }
    Ok(())
}

/// Identifies an image from its first bytes; the file name is never trusted.
/// Returns the MIME type and file extension.
pub fn sniff_image(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some(("image/png", "png"))
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(("image/jpeg", "jpg"))
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some(("image/gif", "gif"))
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(("image/webp", "webp"))
    } else if bytes.len() >= 12
        && &bytes[4..8] == b"ftyp"
        && matches!(&bytes[8..12], b"heic" | b"heix" | b"mif1" | b"msf1")
    {
        Some(("image/heic", "heic"))
    } else {
        None
    }
}

/// Stores image bytes as an attachment after checking type and size.
pub fn store_image_bytes(root: &Path, bytes: &[u8]) -> Result<StoredAttachment, String> {
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("the image is larger than 50 MB".into());
    }
    let (mime_type, extension) =
        sniff_image(bytes).ok_or("the file is not a PNG, JPEG, GIF, WebP, or HEIC image")?;
    let staging = root.join(STAGING_DIR);
    fs::create_dir_all(&staging).map_err(|err| err.to_string())?;
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = IMPORT_COUNTER.fetch_add(1, Ordering::Relaxed);
    let temporary = staging.join(format!("import-{unique:x}-{sequence:x}.tmp"));
    fs::write(&temporary, bytes).map_err(|err| err.to_string())?;
    store_file(root, &temporary, &format!("image.{extension}"), mime_type).map_err(|err| {
        let _ = fs::remove_file(&temporary);
        err.to_string()
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectedFile {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageImport {
    pub stored: Vec<StoredAttachment>,
    pub rejected: Vec<RejectedFile>,
}

/// Imports images from paths the user dropped or picked. Anything that is not
/// an image, or is too large, is rejected with a reason and never read in full.
pub fn import_image_paths(root: &Path, paths: &[PathBuf]) -> ImageImport {
    let mut result = ImageImport::default();
    for path in paths {
        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let outcome = fs::metadata(path)
            .map_err(|err| err.to_string())
            .and_then(|metadata| {
                if !metadata.is_file() {
                    Err("not a file".to_string())
                } else if metadata.len() > MAX_IMAGE_BYTES {
                    Err("the image is larger than 50 MB".to_string())
                } else {
                    fs::read(path).map_err(|err| err.to_string())
                }
            })
            .and_then(|bytes| store_image_bytes(root, &bytes));
        match outcome {
            Ok(stored) => result.stored.push(stored),
            Err(reason) => result.rejected.push(RejectedFile { name, reason }),
        }
    }
    result
}

/// Imports a pasted image, sent as the raw request body.
#[tauri::command]
pub fn import_image_bytes(
    app: AppHandle,
    request: Request<'_>,
) -> Result<StoredAttachment, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the image bytes".into());
    };
    store_image_bytes(&root(&app)?, bytes)
}

/// Imports images dropped onto the window.
#[tauri::command]
pub async fn import_image_files(app: AppHandle, paths: Vec<String>) -> Result<ImageImport, String> {
    let root = root(&app)?;
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    tauri::async_runtime::spawn_blocking(move || import_image_paths(&root, &paths))
        .await
        .map_err(|err| err.to_string())
}

/// Opens the native file picker for images and imports the chosen files.
#[tauri::command]
pub async fn pick_image_files(app: AppHandle) -> Result<ImageImport, String> {
    let root = root(&app)?;
    let dialog_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let picked = dialog_app
            .dialog()
            .file()
            .set_title("Insert images")
            .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "heic"])
            .blocking_pick_files()
            .unwrap_or_default();
        let paths: Vec<PathBuf> = picked
            .into_iter()
            .filter_map(|file| file.into_path().ok())
            .collect();
        import_image_paths(&root, &paths)
    })
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn keep_voice_recording(
    app: AppHandle,
    session_id: String,
) -> Result<StoredAttachment, String> {
    let root = root(&app)?;
    let staged = staged_recording(&root, &session_id)?;
    if !staged.exists() {
        return Err("the recording is no longer available".into());
    }
    store_file(&root, &staged, RECORDING_FILE_NAME, "audio/wav").map_err(|err| err.to_string())
}

#[tauri::command]
pub fn discard_voice_recording(app: AppHandle, session_id: String) -> Result<(), String> {
    let staged = staged_recording(&root(&app)?, &session_id)?;
    if staged.exists() {
        fs::remove_file(staged).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn sweep_attachments(app: AppHandle, keep: Vec<String>) -> Result<usize, String> {
    let keep: HashSet<String> = keep.into_iter().collect();
    sweep(&root(&app)?, &keep).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "nodi-attachments-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("temporary root should be created");
        dir
    }

    #[test]
    fn writes_a_readable_16_khz_mono_wav() {
        let root = temp_root("wav");
        let path = root.join("tone.wav");
        let samples: Vec<i16> = (0..1600).map(|i| (i % 100) as i16 * 100).collect();

        write_wav(&path, &samples, 16_000).expect("wav should be written");

        let reader = hound::WavReader::open(&path).expect("wav should open");
        assert_eq!(reader.spec().channels, 1);
        assert_eq!(reader.spec().sample_rate, 16_000);
        let read: Vec<i16> = reader.into_samples::<i16>().map(Result::unwrap).collect();
        assert_eq!(read, samples);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn stores_files_by_content_hash_and_deduplicates() {
        let root = temp_root("store");
        let first = root.join("a.wav");
        let second = root.join("b.wav");
        fs::write(&first, b"same bytes").unwrap();
        fs::write(&second, b"same bytes").unwrap();

        let stored = store_file(&root, &first, "recording.wav", "audio/wav").unwrap();
        let again = store_file(&root, &second, "recording.wav", "audio/wav").unwrap();

        assert_eq!(stored, again);
        assert_eq!(stored.size, 10);
        assert_eq!(
            stored.relative_path,
            format!(
                "attachments/{}/{}/recording.wav",
                &stored.sha256[..2],
                stored.sha256
            )
        );
        assert!(!first.exists() && !second.exists());
        let on_disk = root
            .join(&stored.sha256[..2])
            .join(&stored.sha256)
            .join("recording.wav");
        assert_eq!(fs::read(on_disk).unwrap(), b"same bytes");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sweep_removes_unreferenced_files_and_empty_directories() {
        let root = temp_root("sweep");
        let kept_source = root.join("k.wav");
        let dropped_source = root.join("d.wav");
        fs::write(&kept_source, b"keep me").unwrap();
        fs::write(&dropped_source, b"drop me").unwrap();
        let kept = store_file(&root, &kept_source, "recording.wav", "audio/wav").unwrap();
        let dropped = store_file(&root, &dropped_source, "recording.wav", "audio/wav").unwrap();
        stage_recording(&root, "voice-1", &[1, 2, 3], 16_000).unwrap();

        let removed = sweep(&root, &HashSet::from([kept.relative_path.clone()])).unwrap();

        assert_eq!(removed, 1);
        assert!(root
            .join(&kept.sha256[..2])
            .join(&kept.sha256)
            .join("recording.wav")
            .exists());
        assert!(!root
            .join(&dropped.sha256[..2])
            .join(&dropped.sha256)
            .exists());
        assert!(root.join(".staging").join("voice-1.wav").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn staging_refuses_paths_outside_the_staging_directory() {
        let root = temp_root("escape");
        assert!(stage_recording(&root, "../../etc/passwd", &[1], 16_000).is_err());
        assert!(stage_recording(&root, "", &[1], 16_000).is_err());
        clear_staging(&root).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    fn png_bytes() -> Vec<u8> {
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        bytes.extend_from_slice(b"rest of a png");
        bytes
    }

    #[test]
    fn recognizes_images_by_their_first_bytes() {
        assert_eq!(sniff_image(&png_bytes()), Some(("image/png", "png")));
        assert_eq!(
            sniff_image(&[0xFF, 0xD8, 0xFF, 0xE0]),
            Some(("image/jpeg", "jpg"))
        );
        assert_eq!(sniff_image(b"GIF89a...."), Some(("image/gif", "gif")));
        assert_eq!(
            sniff_image(b"RIFF\0\0\0\0WEBPVP8 "),
            Some(("image/webp", "webp"))
        );
        assert_eq!(
            sniff_image(b"\0\0\0\x18ftypheic...."),
            Some(("image/heic", "heic"))
        );
        assert_eq!(sniff_image(b"%PDF-1.7"), None);
        assert_eq!(sniff_image(b""), None);
    }

    #[test]
    fn stores_an_image_under_its_hash_with_a_safe_name() {
        let root = temp_root("image");

        let stored = store_image_bytes(&root, &png_bytes()).unwrap();

        assert_eq!(stored.mime_type, "image/png");
        assert_eq!(stored.filename, "image.png");
        assert!(stored.relative_path.ends_with("/image.png"));
        assert!(fs::read_dir(root.join(".staging"))
            .unwrap()
            .next()
            .is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_files_that_are_not_images() {
        let root = temp_root("reject");
        let document = root.join("notes.txt");
        let image = root.join("photo.png");
        fs::write(&document, b"plain text").unwrap();
        fs::write(&image, png_bytes()).unwrap();

        let import = import_image_paths(&root, &[document, image, root.join("missing.png")]);

        assert_eq!(import.stored.len(), 1);
        let rejected: Vec<&str> = import
            .rejected
            .iter()
            .map(|file| file.name.as_str())
            .collect();
        assert_eq!(rejected, vec!["notes.txt", "missing.png"]);
        fs::remove_dir_all(root).unwrap();
    }
}

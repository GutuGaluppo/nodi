//! One-way Markdown mirror of the library (MIRROR-001).
//!
//! The user picks a folder through the native dialog; the choice is stored
//! here, in the app's config directory, never passed in from the webview. The
//! webview only hands over `{ path, content }` pairs, and every path must be a
//! plain relative `.md` path inside that folder. A manifest in the folder
//! lists the files NODI wrote, so NODI only ever deletes its own files.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const CONFIG_FILE: &str = "markdown-mirror.json";
const MANIFEST_FILE: &str = ".nodi-mirror.json";

#[derive(Serialize, Deserialize, Default)]
struct MirrorConfig {
    folder: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct Manifest {
    files: BTreeSet<String>,
}

#[derive(Deserialize)]
pub struct MirrorFile {
    pub path: String,
    pub content: String,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct MirrorFailure {
    pub path: String,
    pub error: String,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MirrorReport {
    pub written: usize,
    pub unchanged: usize,
    pub deleted: usize,
    pub failures: Vec<MirrorFailure>,
}

/// A mirror path must be relative, end in `.md`, and contain only plain
/// names: no `..`, no root, no hidden segments.
pub fn is_safe_relative(path: &str) -> bool {
    let candidate = Path::new(path);
    !path.is_empty()
        && path.len() <= 1024
        && path.ends_with(".md")
        && candidate.components().all(|component| match component {
            Component::Normal(name) => !name.to_string_lossy().starts_with('.'),
            _ => false,
        })
}

fn read_manifest(folder: &Path) -> Manifest {
    fs::read_to_string(folder.join(MANIFEST_FILE))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Removes now-empty directories between `path` and `folder`.
fn prune_empty_parents(folder: &Path, path: &Path) {
    let mut current = path.parent();
    while let Some(dir) = current {
        if dir == folder || !dir.starts_with(folder) {
            break;
        }
        if fs::remove_dir(dir).is_err() {
            break;
        }
        current = dir.parent();
    }
}

/// Writes `files` into `folder`, deleting files a previous run wrote that are
/// no longer part of the library. Files NODI did not write are never touched.
pub fn apply_mirror(folder: &Path, files: &[MirrorFile], force: bool) -> MirrorReport {
    let previous = read_manifest(folder);
    let mut current = Manifest::default();
    let mut report = MirrorReport::default();

    for file in files {
        if !is_safe_relative(&file.path) {
            report.failures.push(MirrorFailure {
                path: file.path.clone(),
                error: "unsafe path".into(),
            });
            continue;
        }
        let target = folder.join(&file.path);
        let unchanged =
            !force && fs::read_to_string(&target).is_ok_and(|existing| existing == file.content);
        if unchanged {
            report.unchanged += 1;
        } else {
            let result = target
                .parent()
                .map_or(Ok(()), fs::create_dir_all)
                .and_then(|()| fs::write(&target, &file.content));
            if let Err(err) = result {
                report.failures.push(MirrorFailure {
                    path: file.path.clone(),
                    error: err.to_string(),
                });
                continue;
            }
            report.written += 1;
        }
        current.files.insert(file.path.clone());
    }

    for stale in previous.files.difference(&current.files) {
        if !is_safe_relative(stale) {
            continue;
        }
        let target = folder.join(stale);
        if target.exists() && fs::remove_file(&target).is_ok() {
            report.deleted += 1;
            prune_empty_parents(folder, &target);
        }
    }

    match serde_json::to_string_pretty(&current) {
        Ok(text) => {
            if let Err(err) = fs::write(folder.join(MANIFEST_FILE), text) {
                report.failures.push(MirrorFailure {
                    path: MANIFEST_FILE.into(),
                    error: err.to_string(),
                });
            }
        }
        Err(err) => report.failures.push(MirrorFailure {
            path: MANIFEST_FILE.into(),
            error: err.to_string(),
        }),
    }
    report
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(CONFIG_FILE))
        .map_err(|err| err.to_string())
}

fn read_folder(app: &AppHandle) -> Result<Option<String>, String> {
    let path = config_path(app)?;
    Ok(fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<MirrorConfig>(&text).ok())
        .and_then(|config| config.folder))
}

fn write_folder(app: &AppHandle, folder: Option<String>) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let text = serde_json::to_string(&MirrorConfig { folder }).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_mirror_folder(app: AppHandle) -> Result<Option<String>, String> {
    read_folder(&app)
}

/// Opens the native folder picker. Returns the chosen folder, or `None` when
/// the user cancels (the previous choice is kept).
#[tauri::command]
pub async fn choose_mirror_folder(app: AppHandle) -> Result<Option<String>, String> {
    let dialog_app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Choose a folder for the Markdown mirror")
            .blocking_pick_folder()
    })
    .await
    .map_err(|err| err.to_string())?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let folder = picked
        .into_path()
        .map_err(|err| err.to_string())?
        .to_string_lossy()
        .into_owned();
    write_folder(&app, Some(folder.clone()))?;
    Ok(Some(folder))
}

/// Stops mirroring. Files already in the folder stay where they are.
#[tauri::command]
pub fn clear_mirror_folder(app: AppHandle) -> Result<(), String> {
    write_folder(&app, None)
}

#[tauri::command]
pub async fn write_mirror(
    app: AppHandle,
    files: Vec<MirrorFile>,
    force: bool,
) -> Result<MirrorReport, String> {
    let folder = read_folder(&app)?.ok_or("no mirror folder is set")?;
    let folder = PathBuf::from(folder);
    if !folder.is_dir() {
        return Err("the mirror folder no longer exists".into());
    }
    tauri::async_runtime::spawn_blocking(move || apply_mirror(&folder, &files, force))
        .await
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_folder(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "nodi-mirror-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("temporary folder should be created");
        dir
    }

    fn file(path: &str, content: &str) -> MirrorFile {
        MirrorFile {
            path: path.into(),
            content: content.into(),
        }
    }

    #[test]
    fn accepts_only_plain_relative_markdown_paths() {
        assert!(is_safe_relative("Launch plan.md"));
        assert!(is_safe_relative("Product/Launch plan.md"));
        for unsafe_path in [
            "",
            "../outside.md",
            "Product/../../outside.md",
            "/Users/me/notes.md",
            "notes.txt",
            ".hidden.md",
            "Product/.git/config.md",
        ] {
            assert!(
                !is_safe_relative(unsafe_path),
                "{unsafe_path} should be refused"
            );
        }
    }

    #[test]
    fn writes_changed_files_and_skips_identical_ones() {
        let folder = temp_folder("write");

        let first = apply_mirror(
            &folder,
            &[file("A.md", "one"), file("Work/B.md", "two")],
            false,
        );
        let second = apply_mirror(
            &folder,
            &[file("A.md", "one"), file("Work/B.md", "2")],
            false,
        );

        assert_eq!((first.written, first.unchanged), (2, 0));
        assert_eq!((second.written, second.unchanged), (1, 1));
        assert_eq!(fs::read_to_string(folder.join("Work/B.md")).unwrap(), "2");
        fs::remove_dir_all(folder).unwrap();
    }

    #[test]
    fn deletes_only_files_it_wrote_before() {
        let folder = temp_folder("delete");
        fs::write(folder.join("Mine.md"), "the user's own file").unwrap();
        apply_mirror(&folder, &[file("A.md", "a"), file("Old/B.md", "b")], false);

        let report = apply_mirror(&folder, &[file("A.md", "a")], false);

        assert_eq!(report.deleted, 1);
        assert!(
            !folder.join("Old").exists(),
            "empty notebook folder is removed"
        );
        assert!(
            folder.join("Mine.md").exists(),
            "user files are never touched"
        );
        assert!(folder.join("A.md").exists());
        fs::remove_dir_all(folder).unwrap();
    }

    #[test]
    fn force_rewrites_every_file() {
        let folder = temp_folder("force");
        apply_mirror(&folder, &[file("A.md", "a")], false);

        let report = apply_mirror(&folder, &[file("A.md", "a")], true);

        assert_eq!((report.written, report.unchanged), (1, 0));
        fs::remove_dir_all(folder).unwrap();
    }

    #[test]
    fn reports_unsafe_paths_without_writing_them() {
        let folder = temp_folder("unsafe");

        let report = apply_mirror(&folder, &[file("../escape.md", "x")], false);

        assert_eq!(
            report.failures,
            vec![MirrorFailure {
                path: "../escape.md".into(),
                error: "unsafe path".into()
            }]
        );
        assert!(!folder.parent().unwrap().join("escape.md").exists());
        fs::remove_dir_all(folder).unwrap();
    }
}

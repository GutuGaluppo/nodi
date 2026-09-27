//! Quick capture from anywhere on the Mac (MAC-001): a global shortcut and a
//! menu bar item that bring NODI forward with a new note ready for typing.
//!
//! Also the `nodi://new?title=…&text=…&url=…` scheme, used by the Share
//! extension (MAC-003) and by Shortcuts. Captures are queued here and drained
//! by the frontend, so one that arrives while NODI is still starting is not
//! lost.

use std::sync::Mutex;

use serde::Serialize;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::plugin::TauriPlugin;
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, Url, Wry};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Asks the frontend to create a note and focus its editor.
pub const EVENT_QUICK_NOTE: &str = "nodi://quick-note";
/// Tells the frontend that captures are waiting in the queue.
pub const EVENT_CAPTURE: &str = "nodi://capture";

/// Longest title and text accepted from a URL.
const MAX_TITLE: usize = 500;
const MAX_TEXT: usize = 100_000;

#[derive(Serialize, Debug, Clone, PartialEq, Eq, Default)]
pub struct Capture {
    pub title: String,
    pub text: String,
    pub url: Option<String>,
}

#[derive(Default)]
pub struct PendingCaptures(pub Mutex<Vec<Capture>>);

/// Reads `nodi://new?title=…&text=…&url=…`. Anything else is ignored.
pub fn parse_capture_url(url: &Url) -> Option<Capture> {
    let is_new = url.host_str() == Some("new") || url.path().trim_matches('/') == "new";
    if url.scheme() != "nodi" || !is_new {
        return None;
    }
    let mut capture = Capture::default();
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "title" => capture.title = value.chars().take(MAX_TITLE).collect(),
            "text" => capture.text = value.chars().take(MAX_TEXT).collect(),
            "url" => {
                // Only web links are kept; other schemes could be abused.
                if let Ok(link) = Url::parse(&value) {
                    if matches!(link.scheme(), "http" | "https") {
                        capture.url = Some(link.to_string());
                    }
                }
            }
            _ => {}
        }
    }
    if capture.title.trim().is_empty() && capture.text.trim().is_empty() && capture.url.is_none() {
        return None;
    }
    Some(capture)
}

fn receive_urls(app: &AppHandle, urls: &[Url]) {
    let captures: Vec<Capture> = urls.iter().filter_map(parse_capture_url).collect();
    if captures.is_empty() {
        return;
    }
    if let Ok(mut pending) = app.state::<PendingCaptures>().0.lock() {
        pending.extend(captures);
    }
    show_main_window(app);
    let _ = app.emit(EVENT_CAPTURE, ());
}

/// Hands every waiting capture to the frontend, emptying the queue.
#[tauri::command]
pub fn take_pending_captures(pending: State<'_, PendingCaptures>) -> Vec<Capture> {
    pending
        .0
        .lock()
        .map(|mut queue| std::mem::take(&mut *queue))
        .unwrap_or_default()
}

/// ⌥⌘N, a system-wide "new note".
pub fn quick_note_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyN)
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn open_quick_note(app: &AppHandle) {
    show_main_window(app);
    let _ = app.emit(EVENT_QUICK_NOTE, ());
}

pub fn shortcut_plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() == ShortcutState::Pressed && *shortcut == quick_note_shortcut() {
                open_quick_note(app);
            }
        })
        .build()
}

/// Registers the shortcut and the menu bar item. A shortcut already taken by
/// another app is reported and skipped; the menu bar item still works.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    if let Err(err) = app.global_shortcut().register(quick_note_shortcut()) {
        eprintln!("NODI could not register ⌥⌘N: {err}");
    }

    let deep_link_app = app.clone();
    app.deep_link()
        .on_open_url(move |event| receive_urls(&deep_link_app, &event.urls()));
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        receive_urls(app, &urls);
    }

    let new_note = MenuItem::with_id(app, "quick-note", "New Note", true, Some("Alt+Cmd+N"))?;
    let show = MenuItem::with_id(app, "show", "Show NODI", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit NODI"))?;
    let menu = Menu::with_items(app, &[&new_note, &show, &separator, &quit])?;

    TrayIconBuilder::with_id("nodi")
        .icon(Image::from_bytes(include_bytes!(
            "../icons/tray-template.png"
        ))?)
        .icon_as_template(true)
        .tooltip("NODI")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quick-note" => open_quick_note(app),
            "show" => show_main_window(app),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_quick_note_shortcut_is_option_command_n() {
        let shortcut = quick_note_shortcut();
        assert!(shortcut.matches(Modifiers::ALT | Modifiers::SUPER, Code::KeyN));
        assert!(!shortcut.matches(Modifiers::SUPER, Code::KeyN));
    }

    #[test]
    fn the_menu_bar_icon_is_a_small_template_image() {
        let icon = Image::from_bytes(include_bytes!("../icons/tray-template.png"))
            .expect("the tray icon should decode");
        assert_eq!((icon.width(), icon.height()), (44, 44));
        // A template image is black with varying opacity.
        assert!(icon
            .rgba()
            .chunks(4)
            .all(|px| px[0] == 0 && px[1] == 0 && px[2] == 0));
        // Only the glyph is drawn: corners and most of the canvas stay clear,
        // or the menu bar shows a solid square.
        let alpha: Vec<u8> = icon.rgba().chunks(4).map(|px| px[3]).collect();
        for corner in [0, 43, 44 * 43, 44 * 44 - 1] {
            assert_eq!(alpha[corner], 0);
        }
        let clear = alpha.iter().filter(|&&a| a == 0).count();
        assert!(clear * 2 > alpha.len(), "only {clear} clear pixels");
    }

    fn parse(url: &str) -> Option<Capture> {
        parse_capture_url(&Url::parse(url).unwrap())
    }

    #[test]
    fn reads_a_shared_page_and_selection() {
        assert_eq!(
            parse("nodi://new?title=Tauri%20docs&text=Plugins%20are%20crates&url=https%3A%2F%2Ftauri.app%2F"),
            Some(Capture {
                title: "Tauri docs".into(),
                text: "Plugins are crates".into(),
                url: Some("https://tauri.app/".into()),
            })
        );
    }

    #[test]
    fn ignores_other_hosts_empty_captures_and_unsafe_links() {
        assert_eq!(parse("nodi://settings?title=x"), None);
        assert_eq!(parse("https://new?title=x"), None);
        assert_eq!(parse("nodi://new"), None);
        assert_eq!(
            parse("nodi://new?text=hi&url=javascript%3Aalert(1)").map(|c| c.url),
            Some(None)
        );
    }

    #[test]
    fn caps_very_long_input() {
        let long = "a".repeat(200_000);
        let capture = parse(&format!("nodi://new?text={long}&title={long}")).unwrap();
        assert_eq!(capture.text.len(), MAX_TEXT);
        assert_eq!(capture.title.len(), MAX_TITLE);
    }
}

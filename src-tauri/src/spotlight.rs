//! Public notes in Spotlight (MAC-002), through Core Spotlight. The index is
//! kept by macOS on this Mac. Private and trashed notes are never indexed, and
//! the feature is off until the user turns it on.
//!
//! Choosing a result makes macOS "continue" a user activity in NODI. Tauri does
//! not expose that callback, so `install_open_handler` wraps the app
//! delegate's implementation at runtime: NODI's Spotlight activities open the
//! note (queued for the frontend), every other activity goes to the original.

use std::sync::{Mutex, OnceLock};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::quick_capture::show_main_window;

/// Tells the frontend a note should open; the id waits in `PendingOpen`.
pub const EVENT_OPEN_NOTE: &str = "nodi://open-note";
const DOMAIN: &str = "notes";
const SNIPPET_CHARS: usize = 300;

#[derive(Deserialize, Debug)]
pub struct SpotlightNote {
    pub id: String,
    pub title: String,
    pub text: String,
    pub keywords: Vec<String>,
}

#[derive(Default)]
pub struct PendingOpen(pub Mutex<Option<String>>);

static APP: OnceLock<AppHandle> = OnceLock::new();

fn snippet(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut cut: String = flat.chars().take(SNIPPET_CHARS).collect();
    if flat.chars().count() > SNIPPET_CHARS {
        cut.push('…');
    }
    cut
}

#[cfg(target_os = "macos")]
mod native {
    use std::sync::{mpsc, OnceLock};
    use std::time::Duration;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject, Bool, Imp, Sel};
    use objc2::{sel, AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::NSApplication;
    use objc2_core_spotlight::{
        CSSearchableIndex, CSSearchableItem, CSSearchableItemActionType,
        CSSearchableItemActivityIdentifier, CSSearchableItemAttributeSet,
    };
    use objc2_foundation::{NSArray, NSError, NSString, NSUserActivity};

    use super::{snippet, SpotlightNote, DOMAIN};

    /// Runs a Core Spotlight call and waits for its completion handler.
    fn wait_for(call: impl FnOnce(&block2::DynBlock<dyn Fn(*mut NSError)>)) -> Result<(), String> {
        let (tx, rx) = mpsc::channel::<Result<(), String>>();
        let block = RcBlock::new(move |error: *mut NSError| {
            // SAFETY: Core Spotlight passes either null or a valid NSError.
            let result = match unsafe { error.as_ref() } {
                None => Ok(()),
                Some(error) => Err(error.localizedDescription().to_string()),
            };
            let _ = tx.send(result);
        });
        call(&block);
        rx.recv_timeout(Duration::from_secs(20))
            .unwrap_or_else(|_| Err("Spotlight did not answer in time".into()))
    }

    pub fn replace(notes: &[SpotlightNote]) -> Result<usize, String> {
        // SAFETY: plain Core Spotlight calls with valid arguments; completion
        // handlers are awaited before returning.
        unsafe {
            if !CSSearchableIndex::isIndexingAvailable() {
                return Err("Spotlight indexing is not available on this Mac".into());
            }
            let index = CSSearchableIndex::defaultSearchableIndex();
            let domains = NSArray::from_retained_slice(&[NSString::from_str(DOMAIN)]);
            wait_for(|done| {
                index.deleteSearchableItemsWithDomainIdentifiers_completionHandler(
                    &domains,
                    Some(done),
                )
            })?;
            if notes.is_empty() {
                return Ok(0);
            }
            let content_type = NSString::from_str("public.text");
            let domain = NSString::from_str(DOMAIN);
            let items: Vec<Retained<CSSearchableItem>> = notes
                .iter()
                .map(|note| {
                    #[allow(deprecated)]
                    let attributes = CSSearchableItemAttributeSet::initWithItemContentType(
                        CSSearchableItemAttributeSet::alloc(),
                        &content_type,
                    );
                    let title = if note.title.trim().is_empty() {
                        "Untitled"
                    } else {
                        note.title.trim()
                    };
                    attributes.setTitle(Some(&NSString::from_str(title)));
                    attributes.setDisplayName(Some(&NSString::from_str(title)));
                    attributes
                        .setContentDescription(Some(&NSString::from_str(&snippet(&note.text))));
                    let keywords: Vec<Retained<NSString>> = note
                        .keywords
                        .iter()
                        .map(|word| NSString::from_str(word))
                        .collect();
                    attributes.setKeywords(Some(&NSArray::from_retained_slice(&keywords)));
                    CSSearchableItem::initWithUniqueIdentifier_domainIdentifier_attributeSet(
                        CSSearchableItem::alloc(),
                        Some(&NSString::from_str(&note.id)),
                        Some(&domain),
                        &attributes,
                    )
                })
                .collect();
            let items = NSArray::from_retained_slice(&items);
            wait_for(|done| index.indexSearchableItems_completionHandler(&items, Some(done)))?;
            Ok(notes.len())
        }
    }

    pub fn clear() -> Result<(), String> {
        // SAFETY: as in `replace`.
        unsafe {
            let index = CSSearchableIndex::defaultSearchableIndex();
            let domains = NSArray::from_retained_slice(&[NSString::from_str(DOMAIN)]);
            wait_for(|done| {
                index.deleteSearchableItemsWithDomainIdentifiers_completionHandler(
                    &domains,
                    Some(done),
                )
            })
        }
    }

    type ContinueActivity = unsafe extern "C-unwind" fn(
        &AnyObject,
        Sel,
        &AnyObject,
        &NSUserActivity,
        *mut AnyObject,
    ) -> Bool;

    /// The delegate's own implementation, called for every activity that is
    /// not one of NODI's Spotlight items.
    static ORIGINAL: OnceLock<ContinueActivity> = OnceLock::new();

    /// `-application:continueUserActivity:restorationHandler:` for the app
    /// delegate. Returns YES for NODI's own Spotlight items.
    unsafe extern "C-unwind" fn continue_activity(
        this: &AnyObject,
        cmd: Sel,
        application: &AnyObject,
        activity: &NSUserActivity,
        restoration: *mut AnyObject,
    ) -> Bool {
        if activity.activityType().to_string() != CSSearchableItemActionType.to_string() {
            return match ORIGINAL.get() {
                Some(original) => original(this, cmd, application, activity, restoration),
                None => Bool::NO,
            };
        }
        let id = activity
            .userInfo()
            .and_then(|info| info.objectForKey(CSSearchableItemActivityIdentifier))
            .and_then(|value| value.downcast::<NSString>().ok())
            .map(|value| value.to_string());
        match (id, super::APP.get()) {
            (Some(id), Some(app)) => {
                super::open_note(app, id);
                Bool::YES
            }
            _ => Bool::NO,
        }
    }

    pub fn install_open_handler() -> Result<(), String> {
        let mtm = MainThreadMarker::new().ok_or("not on the main thread")?;
        let delegate = NSApplication::sharedApplication(mtm)
            .delegate()
            .ok_or("the app has no delegate yet")?;
        let object: &AnyObject = (*delegate).as_ref();
        let class: &AnyClass = object.class();
        let selector = sel!(application:continueUserActivity:restorationHandler:);
        let ours: ContinueActivity = continue_activity;
        // SAFETY: `ours` matches the selector's Objective-C signature (BOOL
        // return, three object arguments), described by the type string, and
        // any original implementation has that same signature.
        unsafe {
            let imp: Imp = std::mem::transmute(ours);
            let class_ptr = class as *const AnyClass as *mut AnyClass;
            if objc2::ffi::class_addMethod(class_ptr, selector, imp, c"B@:@@@".as_ptr()).as_bool() {
                return Ok(());
            }
            let method = objc2::ffi::class_getInstanceMethod(class, selector);
            if method.is_null() {
                return Err("the app delegate cannot take user activities".into());
            }
            if let Some(previous) = objc2::ffi::method_setImplementation(method, imp) {
                let _ = ORIGINAL.set(std::mem::transmute::<Imp, ContinueActivity>(previous));
            }
        }
        Ok(())
    }
}

fn open_note(app: &AppHandle, id: String) {
    if let Ok(mut pending) = app.state::<PendingOpen>().0.lock() {
        *pending = Some(id);
    }
    show_main_window(app);
    let _ = app.emit(EVENT_OPEN_NOTE, ());
}

/// Called once at startup, on the main thread.
pub fn setup(app: &AppHandle) {
    let _ = APP.set(app.clone());
    #[cfg(target_os = "macos")]
    if let Err(err) = native::install_open_handler() {
        eprintln!("NODI cannot open notes from Spotlight: {err}");
    }
}

/// Replaces NODI's Spotlight entries with `notes`. Returns how many are indexed.
#[tauri::command]
pub async fn spotlight_replace_notes(notes: Vec<SpotlightNote>) -> Result<usize, String> {
    #[cfg(target_os = "macos")]
    return tauri::async_runtime::spawn_blocking(move || native::replace(&notes))
        .await
        .map_err(|err| err.to_string())?;
    #[cfg(not(target_os = "macos"))]
    {
        let _ = notes;
        Err("Spotlight is only available on macOS".into())
    }
}

/// Removes every NODI entry from Spotlight.
#[tauri::command]
pub async fn spotlight_clear() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return tauri::async_runtime::spawn_blocking(native::clear)
        .await
        .map_err(|err| err.to_string())?;
    #[cfg(not(target_os = "macos"))]
    Ok(())
}

/// Hands the note chosen in Spotlight to the frontend, once.
#[tauri::command]
pub fn take_pending_open(pending: State<'_, PendingOpen>) -> Option<String> {
    pending.0.lock().ok().and_then(|mut id| id.take())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snippets_are_flat_and_short() {
        assert_eq!(snippet("Line one\n\n  line   two"), "Line one line two");
        let long = snippet(&"word ".repeat(200));
        assert_eq!(long.chars().count(), SNIPPET_CHARS + 1);
        assert!(long.ends_with('…'));
    }
}

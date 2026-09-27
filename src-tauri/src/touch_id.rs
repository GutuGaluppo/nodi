//! Touch ID for private notes (PRIV-REC-004). A copy of the private-notes key
//! is sealed to a Secure Enclave key on this Mac; opening it needs Touch ID or
//! the Mac's password. The sealing itself lives in `native/Keyguard.swift`,
//! because CryptoKit's Secure Enclave keys are only reachable from Swift.
//!
//! Nothing here stores anything: the frontend keeps the sealed text in
//! SQLite, and it is useless on any other Mac.

use serde::Serialize;

/// Shown by macOS in the Touch ID prompt, after "NODI is trying to".
const REASON: &str = "unlock your private notes";

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TouchIdSupport {
    /// The Secure Enclave and some form of owner authentication are there.
    pub available: bool,
    /// Touch ID is enrolled; otherwise macOS asks for the Mac's password.
    pub biometrics: bool,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum Unsealed {
    Opened(String),
    Cancelled,
}

#[cfg(target_os = "macos")]
mod native {
    use std::ffi::{c_char, CStr, CString};

    extern "C" {
        fn nodi_keyguard_available() -> bool;
        fn nodi_keyguard_has_biometrics() -> bool;
        fn nodi_keyguard_seal(secret: *const c_char, out: *mut *mut c_char) -> i32;
        fn nodi_keyguard_unseal(
            sealed: *const c_char,
            reason: *const c_char,
            out: *mut *mut c_char,
        ) -> i32;
        fn nodi_keyguard_free(text: *mut c_char);
    }

    pub fn available() -> bool {
        // SAFETY: no arguments; the Swift side only queries the system.
        unsafe { nodi_keyguard_available() }
    }

    pub fn has_biometrics() -> bool {
        // SAFETY: as above.
        unsafe { nodi_keyguard_has_biometrics() }
    }

    /// Takes ownership of a string the Swift side allocated with `strdup`.
    unsafe fn take(text: *mut c_char) -> String {
        if text.is_null() {
            return String::new();
        }
        let value = CStr::from_ptr(text).to_string_lossy().into_owned();
        nodi_keyguard_free(text);
        value
    }

    fn c_string(value: &str) -> Result<CString, String> {
        CString::new(value).map_err(|_| "unexpected NUL byte".to_string())
    }

    pub fn seal(secret: &str) -> Result<String, String> {
        let secret = c_string(secret)?;
        let mut out = std::ptr::null_mut();
        // SAFETY: valid C strings in, and `out` receives a string we free.
        let (code, text) = unsafe {
            let code = nodi_keyguard_seal(secret.as_ptr(), &mut out);
            (code, take(out))
        };
        if code == 0 {
            Ok(text)
        } else {
            Err(text)
        }
    }

    /// `Ok(None)` when the user cancelled the prompt.
    pub fn unseal(sealed: &str, reason: &str) -> Result<Option<String>, String> {
        let sealed = c_string(sealed)?;
        let reason = c_string(reason)?;
        let mut out = std::ptr::null_mut();
        // SAFETY: as in `seal`. The call blocks while macOS shows the prompt.
        let (code, text) = unsafe {
            let code = nodi_keyguard_unseal(sealed.as_ptr(), reason.as_ptr(), &mut out);
            (code, take(out))
        };
        match code {
            0 => Ok(Some(text)),
            2 => Ok(None),
            _ => Err(text),
        }
    }
}

#[tauri::command]
pub fn touch_id_support() -> TouchIdSupport {
    #[cfg(target_os = "macos")]
    return TouchIdSupport {
        available: native::available(),
        biometrics: native::has_biometrics(),
    };
    #[cfg(not(target_os = "macos"))]
    TouchIdSupport {
        available: false,
        biometrics: false,
    }
}

/// Seals the base64 private-notes key to this Mac's Secure Enclave.
#[tauri::command]
pub async fn touch_id_seal(secret: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    return tauri::async_runtime::spawn_blocking(move || native::seal(&secret))
        .await
        .map_err(|err| err.to_string())?;
    #[cfg(not(target_os = "macos"))]
    {
        let _ = secret;
        Err("Touch ID is only available on macOS".into())
    }
}

/// Opens a sealed key after Touch ID or the Mac's password.
#[tauri::command]
pub async fn touch_id_unseal(sealed: String) -> Result<Unsealed, String> {
    #[cfg(target_os = "macos")]
    {
        let opened = tauri::async_runtime::spawn_blocking(move || native::unseal(&sealed, REASON))
            .await
            .map_err(|err| err.to_string())??;
        Ok(opened.map_or(Unsealed::Cancelled, Unsealed::Opened))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (sealed, REASON);
        Err("Touch ID is only available on macOS".into())
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    const SECRET: &str = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";

    #[test]
    fn reports_support_without_prompting() {
        let support = touch_id_support();
        assert!(!support.biometrics || support.available);
    }

    #[test]
    fn sealed_keys_carry_no_plaintext_and_differ_each_time() {
        if !native::available() {
            return;
        }
        let first = native::seal(SECRET).expect("sealing needs no prompt");
        let second = native::seal(SECRET).expect("sealing needs no prompt");
        assert_ne!(first, second);
        assert!(!first.contains(SECRET));
    }

    #[test]
    fn rejects_bad_input_before_any_prompt() {
        assert!(native::seal("not base64!").is_err());
        assert!(native::unseal("", REASON).is_err());
        assert!(native::unseal("AQID", REASON).is_err());
    }

    #[test]
    fn serializes_the_outcome_for_the_frontend() {
        assert_eq!(
            serde_json::to_value(Unsealed::Opened("a2V5".into())).unwrap(),
            serde_json::json!({ "status": "opened", "value": "a2V5" })
        );
        assert_eq!(
            serde_json::to_value(Unsealed::Cancelled).unwrap(),
            serde_json::json!({ "status": "cancelled" })
        );
    }
}

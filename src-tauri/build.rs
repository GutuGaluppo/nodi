fn main() {
    #[cfg(target_os = "macos")]
    build_native();
    tauri_build::build()
}

/// Compiles the Swift sources in native/ into one static library:
/// Keyguard.swift (Touch ID for private notes, PRIV-REC-004) and
/// TextReader.swift (text in images, OCR-003). CryptoKit's Secure Enclave keys
/// and Vision's document reader are only reachable from Swift; the Swift
/// runtime itself ships with macOS.
#[cfg(target_os = "macos")]
fn build_native() {
    use std::path::PathBuf;
    use std::process::Command;

    let sources = ["native/Keyguard.swift", "native/TextReader.swift"];
    for source in sources {
        println!("cargo:rerun-if-changed={source}");
    }
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR is set"));
    let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        Ok(other) => other,
        Err(_) => "arm64",
    }
    .to_string();
    let library = out_dir.join("libnodi_native.a");
    let status = Command::new("xcrun")
        .args([
            "swiftc",
            "-emit-library",
            "-static",
            "-parse-as-library",
            "-O",
            "-module-name",
            "NodiNative",
            "-target",
            &format!("{arch}-apple-macos15.0"),
        ])
        .args(sources)
        .arg("-o")
        .arg(&library)
        .status()
        .expect("xcrun swiftc should run (install Xcode or the Command Line Tools)");
    assert!(status.success(), "compiling the Swift sources failed");

    let toolchain = Command::new("xcrun")
        .args(["--toolchain", "default", "--find", "swiftc"])
        .output()
        .expect("xcrun should find swiftc");
    let swiftc = PathBuf::from(String::from_utf8_lossy(&toolchain.stdout).trim());
    let swift_lib = swiftc
        .parent()
        .and_then(|bin| bin.parent())
        .map(|usr| usr.join("lib/swift/macosx"))
        .expect("swiftc sits in a toolchain's usr/bin");

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=nodi_native");
    println!("cargo:rustc-link-search=native={}", swift_lib.display());
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    for framework in [
        "AppKit",
        "CryptoKit",
        "Foundation",
        "LocalAuthentication",
        "Security",
        "Vision",
    ] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
}

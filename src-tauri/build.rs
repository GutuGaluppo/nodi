fn main() {
    #[cfg(target_os = "macos")]
    build_keyguard();
    tauri_build::build()
}

/// Compiles native/Keyguard.swift (Touch ID for private notes, PRIV-REC-004)
/// into a static library. CryptoKit's Secure Enclave keys are only reachable
/// from Swift; the Swift runtime itself ships with macOS.
#[cfg(target_os = "macos")]
fn build_keyguard() {
    use std::path::PathBuf;
    use std::process::Command;

    let source = "native/Keyguard.swift";
    println!("cargo:rerun-if-changed={source}");
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR is set"));
    let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        Ok(other) => other,
        Err(_) => "arm64",
    }
    .to_string();
    let library = out_dir.join("libnodi_keyguard.a");
    let status = Command::new("xcrun")
        .args([
            "swiftc",
            "-emit-library",
            "-static",
            "-parse-as-library",
            "-O",
            "-module-name",
            "NodiKeyguard",
            "-target",
            &format!("{arch}-apple-macos15.0"),
        ])
        .arg(source)
        .arg("-o")
        .arg(&library)
        .status()
        .expect("xcrun swiftc should run (install Xcode or the Command Line Tools)");
    assert!(status.success(), "compiling {source} failed");

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
    println!("cargo:rustc-link-lib=static=nodi_keyguard");
    println!("cargo:rustc-link-search=native={}", swift_lib.display());
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    for framework in ["CryptoKit", "LocalAuthentication", "Security", "Foundation"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
}

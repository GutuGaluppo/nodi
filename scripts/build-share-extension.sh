#!/bin/sh
# Builds NODI's macOS Share extension (MAC-003) into
# src-tauri/share-extension/build/NODIShare.appex, which Tauri copies into
# NODI.app/Contents/PlugIns (see bundle.macOS.files in tauri.conf.json).
#
#   PARENT_BUNDLE_ID  the app's identifier (default: read from tauri.conf.json)
#   SIGNING_IDENTITY  codesign identity (default: first Apple Development
#                     identity, else ad-hoc "-")
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
source_dir="$root/src-tauri/share-extension"
output="$source_dir/build/NODIShare.appex"

config="$root/src-tauri/tauri.conf.json"
parent=${PARENT_BUNDLE_ID:-$(plutil -extract identifier raw -o - "$config")}
version=$(plutil -extract version raw -o - "$config")
identity=${SIGNING_IDENTITY:-$(security find-identity -v -p codesigning 2>/dev/null |
  sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -n 1)}
identity=${identity:--}

rm -rf "$output"
mkdir -p "$output/Contents/MacOS"
sed -e "s/__PARENT_BUNDLE_ID__/$parent/" -e "s/__VERSION__/$version/" \
  "$source_dir/Info.plist" > "$output/Contents/Info.plist"

xcrun swiftc \
  -module-name NODIShare \
  -target "$(uname -m)-apple-macos15.0" \
  -swift-version 5 \
  -O \
  -application-extension \
  -parse-as-library \
  -framework Cocoa \
  -Xlinker -e -Xlinker _NSExtensionMain \
  "$source_dir/ShareViewController.swift" \
  -o "$output/Contents/MacOS/NODIShare"

codesign --force --sign "$identity" --options runtime \
  --entitlements "$source_dir/NODIShare.entitlements" "$output"
echo "Built $output for $parent (signed: $identity)"

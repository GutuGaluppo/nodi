# DECISIONS — NODI

A running log of architecture decisions. Each entry is dated, states the choice,
and records the reasoning so a later agent does not have to reverse-engineer it.

## D-001 — Identifier format: UUID version 7

**Date:** September 7, 2026
**Task:** DB-003 Device ID
**Status:** Accepted

### Decision

Every persisted NODI record (notes, notebooks, tags, attachments, shortcuts, the
local device identifier) uses a **UUID version 7** string, generated in the app
before the record is written. Database autoincrement IDs are not used.

The generator lives in [`src/lib/ids/id.ts`](../src/lib/ids/id.ts) and is
implemented locally with `crypto.getRandomValues` — no dependency added.

### Options considered

- **UUID v7** — 48-bit millisecond timestamp + 74 random bits, canonical
  8-4-4-4-12 hex form.
- **ULID** — 48-bit millisecond timestamp + 80 random bits, Crockford base32,
  26 characters.

Both are time-ordered, collision-resistant across devices, and sync-friendly.

### Rationale

- Time-ordered prefix keeps freshly created rows sortable by creation time,
  which simplifies list queries and future sync reconciliation.
- Canonical UUID form is recognised by SQLite tooling, logs, and debuggers
  without explanation; ULID's base32 is less universally understood.
- Client-generated IDs mean the ID exists before persistence, which the schema's
  `device_id` / `revision` fields already anticipate for later multi-device sync.
- Small enough to implement locally, so the "prefer local utilities over
  dependencies" rule applies.

### Consequences

- IDs are 36 characters. Acceptable for a local-first SQLite app.
- If sync later needs lexicographic ULID ergonomics, migrating is a data
  transform, not a schema redesign — the columns stay `TEXT`.

## D-002 — Repositories return camelCase domain objects

**Date:** September 7, 2026
**Task:** NOTE-001 Note repository
**Status:** Accepted

### Decision

Repository functions map `snake_case` SQLite rows to `camelCase` TypeScript
objects (e.g. `content_json` → `contentJson`, `is_pinned` INTEGER `0/1` →
`isPinned` boolean) at the repository boundary. Callers never see raw rows or
column names.

### Rationale

- Keeps every SQL detail — column names, integer-boolean encoding, placeholder
  style — inside `src/db`, matching the rule that UI, editor, and stores must not
  execute or know SQL.
- Domain objects are pleasant to consume from React and easy to validate later
  with Zod if needed.

### Consequences

- Each repository owns a small `mapRow*` function and a `*Row` interface. Minor
  duplication, high clarity.
- List queries return a lighter `*Summary` type that omits large fields (the
  note body) so list rendering stays cheap.

## D-003 — Private notes use a wrapped AES-GCM key

**Date:** September 27, 2026
**Task:** PRIVACY-002 Encrypt private notes at rest
**Status:** Accepted

### Decision

A random 256-bit AES-GCM **note key** encrypts every private note. A
key-encryption key derived from the private-notes password (PBKDF2-SHA-256,
210,000 iterations, its own salt) wraps the note key, which is stored in
`settings.private_notes_key`. Each note's `{ title, contentJson, contentText }`
is sealed as one envelope in `notes.encrypted_payload`, with a fresh 96-bit IV
and the note id as additional authenticated data. Plaintext columns of an
encrypted note hold empty values. Only the Web Crypto API is used.

### Options considered

- **Encrypt each note directly with a password-derived key** — simpler, but a
  future password change would have to re-encrypt every note.
- **SQLCipher for the whole database** — strong, but replaces the SQLite build
  used by `tauri-plugin-sql`, encrypts public notes the user never asked to
  protect, and adds a native dependency.

### Rationale

- Wrapping lets a later password change rewrap one key instead of every note.
- Binding the note id as authenticated data stops ciphertext from being moved
  between notes.
- Web Crypto is built into the webview: no dependency, audited primitives.

### Consequences

- The unwrapped key lives only in memory for the session; writes to an
  encrypted note without it fail instead of overwriting ciphertext.
- Notes made private while locked, and private notes from before this decision,
  stay readable until the next unlock, which encrypts them in one pass. The
  "Your data" page reports how many are waiting.
- After plaintext leaves the database NODI merges the FTS5 index, runs `VACUUM`,
  and truncates the WAL so no deleted plaintext pages remain.
- A forgotten password cannot be recovered on its own; D-010 adds a recovery
  key that wraps the same note key.

## D-004 — Reminders use Tauri's notification plugin

**Date:** September 27, 2026
**Task:** REM-001 Reminders
**Status:** Accepted

### Decision

Reminders are stored in a `reminders` table and delivered as local macOS
notifications through the official `tauri-plugin-notification` (Rust) and
`@tauri-apps/plugin-notification` (JavaScript). A scheduler in the app checks
for due reminders at launch and every 30 seconds.

### Rationale

- `IMPLEMENTATION.md` asks for local OS notifications and no remote push; the
  plugin talks to Notification Center on the Mac and has no network code.
- It is maintained by the Tauri team, alongside the SQL plugin NODI already
  uses, and needs only the `notification:default` permission.

### Consequences

- Reminders fire only while NODI is running; one that came due while NODI was
  closed fires on the next launch. The UI does not promise otherwise.
- Notifications for private notes say "Private note", never the title.
- A reminder is marked delivered after its notification is shown, so it never
  fires twice; a failed notification stays pending and is retried.

## D-005 — Kept recordings are WAV files with the transcript in the note

**Date:** September 27, 2026
**Tasks:** ATT-001, ATT-002, VOICE-AUD-001 to VOICE-AUD-003
**Status:** Accepted

### Decision

- A kept dictation is a 16 kHz 16-bit mono WAV file in content-addressed
  attachment storage (`attachments/<prefix>/<sha256>/recording.wav`), written
  with `hound`; its metadata is a row in `attachments`.
- The timed transcript lives in a `voiceRecording` Tiptap node's attributes,
  not in a separate table.
- The webview plays files through Tauri's asset protocol, scoped to
  `$APPDATA/attachments/**`; the CSP allows it only as a media source.
- Recordings are resampled to 16 kHz while capturing and kept as 16-bit
  samples, which allows one-hour recordings; long audio is transcribed in
  five-minute chunks with progress events.

### Rationale

- WAV needs no encoder dependency and Whisper already works on 16 kHz audio.
  At about 1.9 MB per minute it is larger than AAC, which is acceptable for
  local storage; a compressed format can come later without changing the
  schema.
- Tiptap JSON is canonical note content (`AGENTS.md`). Keeping the segments
  there means they are saved, searched, and encrypted with the note for free.
- `hound` was already a dev-dependency and `sha2` was already in the lockfile
  through Tauri, so neither adds new code to the build.

### Consequences

- Private notes never keep audio: the WAV file is not encrypted.
- Files are deleted by a launch-time sweep when no attachment row references
  them (for example after a note is deleted from the Trash). A recording block
  removed from a note keeps its file until the note itself is deleted.
- A word spoken across a five-minute chunk boundary may be split.

## D-006 — The Markdown mirror folder is owned by the Rust side

**Date:** September 27, 2026
**Tasks:** EXPORT-001, MIRROR-001, MIRROR-002
**Status:** Accepted

### Decision

The mirror folder is chosen with the native folder picker from Rust
(`tauri-plugin-dialog`, used only from Rust, with no JavaScript permission) and
stored in `markdown-mirror.json` in the app config directory. The webview can
only send `{ path, content }` pairs; Rust accepts plain relative `.md` paths,
writes only changed files, and records what it wrote in `.nodi-mirror.json` in
the folder so it only ever deletes its own files. Markdown comes from a pure
Tiptap-to-Markdown converter shared with future exports.

### Rationale

- A webview that could name any path would be a general file writer. Keeping
  the folder on the Rust side limits the webview to Markdown files inside the
  one folder the user picked.
- A manifest lets people keep their own files in the same folder safely.
- One converter for export and mirror keeps both outputs identical.

### Consequences

- Private and trashed notes are never mirrored.
- The mirror is one-way: edits made to the files are overwritten by the next
  pass, and SQLite stays the source of truth.
- A pass runs at launch and two seconds after the last change; its outcome is
  kept in `settings` and shown on the "Your data" page.

## D-007 — Image text is recognized with Vision through objc2

**Date:** September 27, 2026
**Tasks:** ATT-003, OCR-001, OCR-002
**Status:** Accepted

### Decision

- Images are inserted from the file picker, the clipboard, or files dropped on
  the window. Rust identifies each image from its first bytes (PNG, JPEG, GIF,
  WebP, HEIC), refuses files over 50 MB, and stores it as an attachment; the
  note keeps only the stored path and the display URL is computed at render.
- Text is recognized with Apple's Vision framework through `objc2-vision`,
  which matches the `objc2` and `objc2-foundation` versions Tauri already
  ships, in the app process and off the main thread.
- Recognized text lives in `attachment_text` with its own FTS5 index;
  search appends notes found only through an image, marked "Found in an image".

### Rationale

- Vision is on every Mac, accurate, and free: no model download, no network.
- A Rust binding avoids shipping and signing a separate Swift helper.
- A separate FTS table avoids rebuilding the notes index, which would need a
  migration that recreates a virtual table with existing data.

### Consequences

- Images cannot be added to private notes, because image files are not
  encrypted, and a note that already has files asks for confirmation before it
  becomes private; its recognized text is deleted by a trigger.
- Recognition runs one image at a time, at launch and three seconds after
  changes; an unreadable image is stored with empty text so it is not retried.

## D-008 — Related notes use on-device NaturalLanguage embeddings

**Date:** September 27, 2026
**Tasks:** REL-001, REL-002
**Status:** Accepted (exception to "no semantic embeddings in V1", limited to on-device computation, approved by the owner on September 27, 2026)

### Decision

Each active, non-private note gets a sentence embedding from Apple's
NaturalLanguage framework (`objc2-natural-language`, same `objc2` family Tauri
already ships), computed in the app. Vectors are stored in `note_embeddings`
as base64 float32 with the note's language and the `updated_at` they were
computed from. The panel ranks by cosine similarity in the webview, comparing
only notes of the same language.

### Rationale

- No model download, no network, no vector database: the framework is on every
  Mac. Ranking 5,000 notes takes well under the 50 ms budget in plain code.
- Scores were calibrated on real notes: related ones scored 0.68–0.76 and
  unrelated ones up to 0.58. A note is shown when it scores at least 0.5 and
  within 0.12 of the best match, so the panel stays quiet when nothing fits.

### Consequences

- Vectors from different languages live in different spaces (English and
  Portuguese even have different dimensions) and are never compared.
- A note in a language without sentence embeddings gets no vector and no panel.
- Private notes never get a vector, and a trigger deletes it when a note turns
  private. Linking related notes waits for LINK-001.

## D-009 — macOS integration without a separate helper app

**Date:** September 27, 2026
**Tasks:** MAC-001 to MAC-004
**Status:** Accepted

### Decision

- **Capture:** a global ⌥⌘N (`tauri-plugin-global-shortcut`) and a menu bar
  item (Tauri's tray icon) bring NODI forward with a new note.
- **`nodi://new`:** `tauri-plugin-deep-link` registers the scheme. Rust parses
  it (title and text capped, only http(s) links kept) and queues captures; the
  frontend drains the queue, so a capture that arrives at launch is kept.
- **Share extension:** a small Swift `NSViewController` compiled with `swiftc`
  into a sandboxed `.appex` (no Xcode project), embedded through
  `bundle.macOS.files`. It turns what was shared into a `nodi://new` URL.
- **Spotlight:** Core Spotlight through `objc2-core-spotlight`, off by default.
  Choosing a result continues a user activity; NODI wraps the Tao app
  delegate's `application:continueUserActivity:restorationHandler:` at runtime,
  handling its own activities and forwarding every other one.
- **Quick Look (MAC-004):** no code. The Markdown mirror (MIRROR-001) already
  produces files Quick Look previews.

### Rationale

- All three plugins are official Tauri plugins; versions are pinned so the
  `tauri` crate stays on the version matching `@tauri-apps/api`.
- A URL scheme is the one channel the sandboxed extension, Shortcuts, and
  other apps can all use without shared containers or App Groups.

### Consequences

- The Share extension needs Xcode or the Command Line Tools to build, and is
  enabled by the user once in System Settings.
- The runtime delegate wrap depends on Tao's delegate class; if a future Tao
  changes it, NODI logs that notes cannot be opened from Spotlight and keeps
  working otherwise.
- Opening a note by clicking a Spotlight result was verified up to the hook's
  installation; the click itself needs the Spotlight UI and was not automated.

## D-010 — Private notes are recovered with a recovery key, not an account

**Date:** September 27, 2026
**Tasks:** PRIV-REC-001 to PRIV-REC-003
**Status:** Accepted

### Decision

- **Recovery key:** 160 random bits, shown once as eight groups of four
  Crockford base32 characters. It wraps the same note key as the password
  (D-003), through HKDF-SHA-256 and AES-GCM, and is stored only in that wrapped
  form in `settings.private_notes_recovery_key`.
- **Shown once, stored after confirmation:** NODI keeps nothing until the user
  types the key's last group. Setup cannot skip it; notes that predate it get
  the offer at the next unlock, and "Your data" keeps warning until one exists.
- **Reset:** the recovery key unwraps the note key and a new password wraps it
  again. Notes are not re-encrypted. The old recovery key keeps working until
  the user saves the new one NODI offers right away.
- **Starting over:** with neither password nor recovery key, encrypted private
  notes are deleted for good after a typed confirmation, and the keys are
  removed. Private notes still in plaintext are kept and encrypted with the
  next key.
- **Making a new key** from "Your data" needs the password, which also
  retires the previous key.

### Rationale

- No email, account, or server: recovery stays inside NODI's local-only model.
- The key is random, so a fast KDF is enough; the slow PBKDF2 protects only
  the human-chosen password.
- Password hints and security questions are left out: they leak or are
  guessable. A copy of the key kept in the database "just in case" would undo
  the encryption.

### Consequences

- Whoever holds the recovery key can open private notes; the UI says so.
- Settings writes are not transactional: the new password's wrapped key is
  written before its verifier, so an interruption leaves the recovery key
  working and the reset can simply run again.
- Touch ID (PRIV-REC-004) is described in D-011.

## D-011 — Touch ID seals the note key to the Secure Enclave with CryptoKit

**Date:** September 27, 2026
**Task:** PRIV-REC-004 Touch ID
**Status:** Accepted

### Decision

- An opt-in copy of the note key is sealed to a CryptoKit
  `SecureEnclave.P256.KeyAgreement` key created with `.userPresence`: Touch ID,
  or the Mac's password when Touch ID is not enrolled. Sealing is ECIES-style
  (an ephemeral P-256 key, HKDF-SHA-256, AES-GCM) against the enclave key's
  public half, so turning it on needs only the private-notes password.
- The sealed text, including the enclave key's data representation, is kept
  in `settings.private_notes_touch_id`. It is useless on any other Mac.
- It unlocks private notes and, like the recovery key, can reset a forgotten
  password. Turning it off, or starting private notes over, deletes it.
- The Swift code (`src-tauri/native/Keyguard.swift`) is compiled by `build.rs`
  into a static library with a small C interface. The Swift runtime ships with
  macOS.

### Rationale

- A Keychain item protected by Touch ID needs the data-protection keychain,
  which requires a team-signed app with a keychain access group. NODI's local
  builds are signed ad hoc. CryptoKit's Secure Enclave keys are not Keychain
  items and work with ad-hoc signing.
- No new crate: Swift is already part of the build for the Share extension.

### Consequences

- Anyone who can pass Touch ID or knows this Mac's login password can open
  private notes; the Your data row says so and it is off by default.
- Building NODI on macOS now needs `swiftc` (Xcode or the Command Line Tools),
  already a requirement for the Share extension.
- The prompt itself cannot be automated: sealing, bad input and support
  detection are tested natively, and the prompt was checked by hand.

## D-012 — Image-to-note reuses Vision OCR and attachment storage

**Date:** September 30, 2026
**Task:** OCR-003 Notes from images (`IMAGE_TO_TEXT_SPEC.md`)
**Status:** Accepted

### Decision

- Text is read by the existing Apple Vision recognizer through a new
  `read_image_text` command that also returns the mean line confidence.
  The spec's tesseract.js, sharp and uuid are not added.
- The image is stored by the existing attachment import (type sniffing, 50 MB
  limit) before reading. It becomes an attachment of the new note only when
  the text is approved; an abandoned image is removed by the launch sweep.
- Provenance lives in the existing tables: the `attachments` row links the
  source image to the note, and `attachment_text` keeps what Vision read (so
  the background indexer does not read it again). No `notes.metadata` column
  or migration is added.
- A read that takes over 30 seconds is retried once, then reported.

### Rationale

- tesseract.js downloads its language data from a CDN by default, which would
  be a cloud dependency, and adds ~14 MB; Vision is already on every Mac and
  already tested in NODI. sharp is a Node library and cannot run in the
  webview; Vision reads large images directly.
- A metadata column would duplicate what the attachment tables already record.

### Consequences

- Image-to-note works only on macOS, like the rest of OCR.
- There is no in-app camera capture yet; photos come from the file picker or
  the clipboard (including Continuity Camera images pasted from an iPhone).
- Whether the person edited the text is not stored.

## D-013 — Image text is laid out from line geometry and checked for spelling

**Date:** September 30, 2026
**Task:** OCR-004 Better image reading
**Status:** Accepted (supersedes the confidence score of D-012)

### Decision

- Recognition moves to `src-tauri/native/TextReader.swift`, compiled with
  Keyguard.swift into one static library. On macOS 26 and later it uses
  Vision's `RecognizeDocumentsRequest`, which groups lines into paragraphs;
  earlier systems keep `VNRecognizeTextRequest`. The `objc2-vision` crate is
  removed.
- Both return lines with their positions; `text_layout.rs` joins lines at
  the same height that do not overlap sideways into one row (a price and its
  item, a word written to the side), makes blocks from the reader's
  paragraphs or from vertical gaps, and turns rows starting with a bullet or
  an arrow into `- ` list items. The background indexer uses the same text.
- The review no longer shows a confidence score. Vision reports 100% on
  handwriting it misreads. Instead, the Mac's spell checker (pt_BR, offline)
  lists doubtful words with its guesses; a guess written elsewhere in the text
  comes first. Nothing is replaced unless the person picks a guess.
- In the reviewed text, a blank line separates paragraphs and `- ` starts a
  bullet item; the note gets real paragraphs, line breaks and bullet lists.

### Rationale

- Measured on a photo of two handwritten sticky notes
  (`tests/fixtures/ocr-handwritten-notes.jpg`): fixing the recognition
  language changed nothing, and image scaling changed results erratically. The
  document reader fixed about a quarter of the misread words and all of the
  script confusion ("o tempo" had come back in Cyrillic). The spell checker
  flagged exactly the remaining misreadings, often with the right guess.
- Geometry fixes what both readers get wrong about receipts: the document
  reader returns the price column after the item column.

### Consequences

- Words that are valid English are not flagged, unless a guess appears in the
  text ("manus" beside "menus").
- Handwriting is still imperfect; the doubtful-word list points the person to
  what to check rather than claiming a score.

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
- A forgotten password cannot be recovered.

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

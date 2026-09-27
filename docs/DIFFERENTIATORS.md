# NODI — Differentiators Implementation Plan

This plan extends `IMPLEMENTATION.md` with seven features that set NODI apart from other note apps. Every feature strengthens the same position: **local, private, and native to the Mac, with on-device intelligence and no cloud cost.**

The rules of `IMPLEMENTATION.md` and `AGENTS.md` still apply: one task at a time, tests for persistent data, immutable migrations, no new dependency or cloud service without approval, and an ABOUT entry at the end of every task.

## Milestone overview

| Milestone | Theme | Tasks | Depends on | Approval needed |
| --- | --- | --- | --- | --- |
| F | Verifiable privacy | PRIVACY-002, PRIVACY-003, PRIVACY-004 | PRIVACY-001 | None |
| G | Voice commands beyond lists | VOICE-CMD-001, VOICE-CMD-002, VOICE-CMD-003 | Voice dictation | VOICE-CMD-003 needs REM-001 |
| H | Voice notes with synchronized audio | VOICE-AUD-001, VOICE-AUD-002, VOICE-AUD-003 | ATT-001, ATT-002 | Audio encoding approach |
| I | Markdown mirror | MIRROR-001, MIRROR-002 | EXPORT-001 | Filesystem plugin scope |
| J | On-device OCR | OCR-001, OCR-002 | ATT-003 | Native bridge (Vision) |
| K | Related notes | REL-001, REL-002 | LINK-001 | Exception to "no semantic search in V1" |
| L | macOS integration | MAC-001, MAC-002, MAC-003, MAC-004 | CAP-001 | Native bridge, app extension target |

Recommended order: F → G → H → I → J → K → L. F closes a real gap between what the product promises and what the code does, so it comes first.

## Shared principles for these milestones

- **Nothing leaves the Mac.** A feature that needs the network is out of scope, not "optional".
- **SQLite stays the source of truth.** Mirrors, indexes, and caches are derived and can be rebuilt.
- **Native capability over dependency.** Prefer Apple frameworks (Vision, NaturalLanguage, Core Spotlight) reached through a thin Rust bridge over third-party libraries.
- **Honest UI.** Screens describe what the app actually guarantees, and tests check those guarantees.

---

# Milestone F — Verifiable privacy

**Outcome:** private notes are unreadable without the password, the app cannot reach the network, and the user can see the evidence.

## PRIVACY-002 Encrypt private notes at rest

### Goal

Private notes are stored encrypted in SQLite. Without the password, the database file reveals neither the title nor the content.

### Context

PRIVACY-001 added a password gate but kept `title`, `content_json`, and `content_text` in plaintext. Only a PBKDF2 verifier of the password is stored.

### Scope

- Migration `0008_private_note_encryption.sql` adds a nullable `notes.encrypted_payload` column.
- Key hierarchy:
  - a random 256-bit AES-GCM **note key** encrypts every private note;
  - a **key-encryption key** derived from the password (PBKDF2-SHA-256, 210,000 iterations, its own salt) wraps the note key;
  - the wrapped key, salt, and IV are stored in `settings.private_notes_key`; the password is never stored.
- Each private note stores `{ title, contentJson, contentText }` as one AES-GCM envelope with a fresh 96-bit IV and the note id as additional authenticated data, so ciphertexts cannot be swapped between notes.
- Plaintext columns of an encrypted note hold empty values (`''`, empty document).
- The unwrapped note key lives only in memory for the running session.
- Pending encryption: a note made private while locked, or a private note created before this task, stays readable until the next successful unlock, when all pending notes are encrypted in one pass.
- After plaintext leaves the database: merge the FTS5 index (`optimize`), `VACUUM`, and truncate the WAL so no deleted plaintext pages remain. `secure_delete` is enabled on the connection.
- Making a note public decrypts it back into the plaintext columns.
- Shortcuts show "Private note" instead of the title.

### Acceptance criteria

- The title and body of an encrypted private note do not appear in `notes`, `notes_fts`, or the database file.
- Unlocking decrypts the note; editing and autosave re-encrypt it.
- Writing to an encrypted note without the session key fails with a clear error and changes nothing.
- A wrong password never unwraps the key.
- Existing private notes are encrypted on the first unlock after upgrading.
- The editor never renders a locked, empty copy that autosave could write back.

### Non-goals

- Changing or recovering the password (a lost password means lost private notes; the UI says so).
- Encrypting public notes, tags, or notebook names.
- Auto-lock timers.

### Verification

- Unit tests for the cipher (round trip, wrong key, tampered data, wrong note id).
- Repository tests for encrypt-on-write, decrypt-on-read, pending encryption, and refusal without a key.
- Migration test counts 8 migrations and finds the new column.
- Manual check: `sqlite3 nodi.db "SELECT title, content_text, encrypted_payload FROM notes WHERE is_private = 1"` shows only ciphertext.

## PRIVACY-003 Network lockdown

### Goal

NODI's webview cannot open network connections, and the build fails a test if that changes.

### Scope

- A restrictive Content Security Policy in `tauri.conf.json`: `default-src 'self'`, `connect-src` limited to Tauri IPC, no remote `script-src`, `img-src` limited to local sources.
- `devCsp` allows only the local Vite dev server and its HMR socket.
- A test reads `tauri.conf.json` and the capability files and fails if the CSP allows remote connections or a network permission (`http:*`, `websocket:*`, `upload:*`) is granted.

### Acceptance criteria

- The app starts, edits, searches, dictates, and renders images with the new CSP.
- The test fails when a remote host is added to `connect-src`.

### Non-goals

- Blocking network access of the Rust process at the OS level (the Rust code has no HTTP client; a future task may add a `cargo deny` rule).

### Verification

- `pnpm check` runs the configuration test.
- Manual native run with an isolated identifier to confirm nothing breaks.

## PRIVACY-004 "Your data" panel

### Goal

One screen shows where the user's data lives and proves its state.

### Scope

- Settings → "Your data" opens a panel with:
  - database location (with a Copy button) and size;
  - counts of notes, notes in Trash, and private notes (encrypted versus waiting for unlock);
  - integrity check result (`PRAGMA quick_check`);
  - network status, stated from the enforced policy;
  - last backup: "No backups yet" until BACKUP-001 exists.
- All values are read locally; nothing is sent anywhere.

### Acceptance criteria

- Every value comes from the live database or the enforced configuration, not from constants.
- The panel is keyboard accessible and readable in both themes.

### Non-goals

- Running backups or repairs from the panel.

### Verification

- Repository tests for the storage report.
- Component test for the panel states (loading, healthy, pending encryption, error).

---

# Milestone G — Voice commands beyond lists

**Outcome:** a spoken sentence can create an organized note, not only a list.

## VOICE-CMD-001 Organizing commands

- **Goal:** recognize "no caderno X", "in notebook X", "com a tag Y", "tag Y", "título: Z", and "title: Z" in Portuguese and English.
- **Scope:** extend `voiceCommandParser` with a command prefix grammar; resolve notebook and tag names case-insensitively against existing ones; unknown names are offered for creation, never created silently.
- **Acceptance criteria:** "Crie uma lista de compras no caderno Casa com a tag mercado: leite e pão" creates a bullet list in *Casa*, tagged *mercado*.
- **Non-goals:** an LLM, free-form intent detection.
- **Verification:** parser unit tests in both languages; a component test for the confirmation UI.

## VOICE-CMD-002 Command preview

- **Goal:** before inserting, the voice panel shows what will happen ("List · Notebook: Casa · Tag: mercado") and lets the user remove any part.
- **Verification:** component tests; keyboard-only flow.

## VOICE-CMD-003 Spoken reminders

- **Goal:** "lembrete amanhã às 10" / "remind me tomorrow at 10" attaches a reminder.
- **Depends on:** REM-001 Reminders.
- **Scope:** local date and time parsing for relative days, weekdays, and clock times in both languages; ambiguous phrases ask for confirmation.

---

# Milestone H — Voice notes with synchronized audio

**Outcome:** a dictation can keep its audio, and every sentence plays back from the moment it was spoken.

## VOICE-AUD-001 Keep the recording

- **Goal:** optionally save the captured audio as an attachment of the note.
- **Scope:** encode in Rust to a compact format (AAC through AVFoundation, or Opus if a dependency is approved); store under the attachments directory, never in SQLite; record duration and size in `attachments`.
- **Approval needed:** encoding approach.

## VOICE-AUD-002 Timed transcript

- **Goal:** keep Whisper's `segments` (`startMs`, `endMs`, `text`), which are discarded today.
- **Scope:** migration adding a `transcript_segments` table keyed by attachment; insert segments as a Tiptap node that links each sentence to its time.
- **Verification:** persistence test for segments; deleting the note removes audio and segments.

## VOICE-AUD-003 Playback

- **Goal:** click a sentence to play from its start; the current sentence highlights while playing.
- **Scope:** local `<audio>` through Tauri's asset protocol (adjusting the PRIVACY-003 CSP for local assets only); keyboard controls; long "meeting mode" recordings split into chunks for transcription.

---

# Milestone I — Markdown mirror

**Outcome:** the user's notes outlive the app.

## MIRROR-001 One-way mirror

- **Goal:** keep a folder chosen by the user with one `.md` file per note, updated after each save.
- **Scope:** folder per notebook, front matter with id, tags, and dates; private notes are never mirrored; renames and deletions propagate; SQLite stays the source of truth.
- **Approval needed:** filesystem access scope for the chosen folder.
- **Depends on:** EXPORT-001 (Tiptap JSON → Markdown).

## MIRROR-002 Mirror health

- **Goal:** show last mirror time and any failed files in "Your data"; "Rebuild mirror" regenerates everything.

---

# Milestone J — On-device OCR

**Outcome:** text inside images becomes searchable.

## OCR-001 Vision bridge

- **Goal:** a Rust command runs Apple's Vision text recognition on an image attachment.
- **Approval needed:** native bridge crate (`objc2` family) or a small Swift helper.

## OCR-002 Searchable image text

- **Goal:** store recognized text per attachment and add it to the FTS5 projection; search results say "Found in image".
- **Scope:** migration for `attachment_text`; background processing queue with progress; private notes are skipped.
- **Depends on:** ATT-003 Image insertion.

---

# Milestone K — Related notes

**Outcome:** discovery without sending notes anywhere.

## REL-001 On-device embeddings

- **Goal:** compute a sentence embedding per note with Apple's NaturalLanguage framework and store it in SQLite.
- **Approval needed:** an explicit exception to "no semantic embeddings in V1", limited to on-device computation.
- **Scope:** recompute after saves with a debounce; private notes excluded.

## REL-002 Related notes panel

- **Goal:** a side panel lists the five most similar notes, with one-click linking when LINK-001 exists.
- **Verification:** deterministic tests with fixed vectors; performance budget of 50 ms for 5,000 notes.

---

# Milestone L — macOS integration

**Outcome:** NODI behaves like a first-class Mac app.

| Task | Goal | Notes |
| --- | --- | --- |
| MAC-001 Global capture shortcut | A system-wide shortcut opens a quick-note window | Builds on CAP-001 and CAP-002 |
| MAC-002 Spotlight | Public notes appear in Spotlight through Core Spotlight | Private notes never indexed |
| MAC-003 Share extension | "Send to NODI" from the macOS Share menu | Separate app extension target |
| MAC-004 Quick Look | Preview mirrored Markdown or exported notes | Depends on MIRROR-001 |

---

## Status

| Task | Status |
| --- | --- |
| PRIVACY-002 Encrypt private notes at rest | Done |
| PRIVACY-003 Network lockdown | Done |
| PRIVACY-004 "Your data" panel | Done |
| VOICE-CMD-001 Organizing commands | Done |
| VOICE-CMD-002 Command preview | Done |
| REM-001 Reminders (prerequisite from `IMPLEMENTATION.md`) | Done |
| VOICE-CMD-003 Spoken reminders | Done |
| All other tasks | Not started |

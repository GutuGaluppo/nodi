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

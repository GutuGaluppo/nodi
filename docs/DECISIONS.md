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

# IMPLEMENTATION.md

# NODI — Implementation Guide

> Status: Initial implementation blueprint  
> Primary platform: macOS  
> Future targets: iPadOS / iOS / Android  
> Development style: AI-first / vibe-coding with human review  
> Architecture: local-first, offline-first, keyboard-first, privacy-first, cloud-optional

---

## 0. Purpose of this document

This file is the operational implementation guide for NODI.

It exists so that any coding agent working inside VS Code can understand:

- what must be built;
- in which order;
- which technologies are allowed;
- which technologies are intentionally excluded;
- where files belong;
- how persistence works;
- how changes must be tested;
- which acceptance criteria define completion;
- what must not be refactored without an explicit task.

This document is intentionally implementation-oriented.

For product intent, architecture rationale, data model details and design decisions, use the companion project documents:

```text
/docs/PRODUCT.md
/docs/ARCHITECTURE.md
/docs/DATA_MODEL.md
/docs/DESIGN_SYSTEM.md
/docs/DECISIONS.md
/docs/TASKS.md
/AGENTS.md
```

---

# 1. Product implementation principles

The application must remain:

```text
local-first
offline-first
keyboard-first
privacy-first
cloud-optional
```

The initial product must not require:

```text
user accounts
authentication
remote APIs
cloud databases
subscription services
external analytics
external AI APIs
server-side infrastructure
```

The first implementation must work completely offline on a Mac.

---

# 2. Initial technical stack

Use the following stack unless an explicit architecture task changes it.

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 |
| UI framework | React |
| Language | TypeScript |
| Build tool | Vite |
| Rich text editor | Tiptap / ProseMirror |
| Database | SQLite |
| Full-text search | SQLite FTS5 |
| SQLite bridge | Tauri SQL plugin |
| Server-state/data access cache | TanStack Query |
| UI state | Zustand |
| Validation | Zod |
| Virtualized lists | TanStack Virtual |
| Accessible UI primitives | Radix UI |
| Icons | Lucide |
| Styling | CSS Modules + CSS Variables |
| Unit tests | Vitest |
| Component tests | React Testing Library |
| E2E | Playwright |
| Lint / format | Biome |
| Package manager | pnpm |
| Version control | Git |

---

# 3. Technologies intentionally excluded from V1

Do not introduce any of the following without an explicit approved task:

```text
Next.js
Electron
Prisma
Drizzle
Redux
MobX
GraphQL
tRPC
Supabase
Firebase
Appwrite
AWS SDK
Cloudflare SDK
Yjs
CRDT sync
real-time collaboration
remote storage
remote authentication
AI APIs
semantic embeddings
vector databases
analytics SDKs
error-reporting SaaS
```

This does not mean these tools are forbidden forever.

They are simply outside the initial product scope.

---

# 4. Required local environment

Before implementing product features, verify the developer machine has:

```text
Node.js LTS
pnpm
Rust stable
Cargo
Xcode Command Line Tools
Git
VS Code
```

Recommended verification:

```bash
node --version
pnpm --version
rustc --version
cargo --version
git --version
xcode-select -p
```

If Rust is missing:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Then:

```bash
rustup update
```

---

# 5. Repository bootstrap

Create the application using Tauri + React + TypeScript + Vite.

Preferred bootstrap:

```bash
pnpm create tauri-app
```

Choose:

```text
Project name: nodi
Package manager: pnpm
UI template: React
Language: TypeScript
```

Then:

```bash
cd nodi
pnpm install
pnpm tauri dev
```

The first acceptance gate is:

```text
The application opens as a native macOS desktop window.
```

Do not add application features until this succeeds.

---

# 6. Git initialization

If not already created:

```bash
git init
git add .
git commit -m "chore: bootstrap tauri react app"
```

Create a `.gitignore` containing at minimum:

```gitignore
node_modules
dist
target
.DS_Store
*.log
.env
.env.*
!.env.example
playwright-report
test-results
coverage
```

Never commit:

```text
database files
local attachments
temporary backups
secrets
developer-specific configuration
```

---

# 7. Initial repository structure

Normalize the project to the following structure:

```text
nodi/
│
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── providers.tsx
│   │   ├── shortcuts.ts
│   │   └── bootstrap.ts
│   │
│   ├── components/
│   │   ├── ui/
│   │   └── layout/
│   │
│   ├── features/
│   │   ├── notes/
│   │   ├── notebooks/
│   │   ├── tags/
│   │   ├── search/
│   │   ├── tasks/
│   │   ├── attachments/
│   │   ├── shortcuts/
│   │   ├── trash/
│   │   └── settings/
│   │
│   ├── editor/
│   │   ├── components/
│   │   ├── extensions/
│   │   ├── hooks/
│   │   ├── editor-config.ts
│   │   └── types.ts
│   │
│   ├── db/
│   │   ├── migrations/
│   │   ├── repositories/
│   │   ├── queries/
│   │   ├── schema/
│   │   ├── database.ts
│   │   └── types.ts
│   │
│   ├── lib/
│   │   ├── files/
│   │   ├── platform/
│   │   ├── dates/
│   │   ├── ids/
│   │   └── errors/
│   │
│   ├── hooks/
│   │
│   ├── stores/
│   │
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── themes.css
│   │   ├── global.css
│   │   └── editor.css
│   │
│   └── test/
│       ├── fixtures/
│       ├── factories/
│       └── setup.ts
│
├── src-tauri/
│
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── DESIGN_SYSTEM.md
│   ├── DECISIONS.md
│   └── TASKS.md
│
├── .agents/
│   ├── planner.md
│   ├── builder.md
│   ├── verifier.md
│   ├── ui-auditor.md
│   ├── database-auditor.md
│   └── security-auditor.md
│
├── AGENTS.md
├── IMPLEMENTATION.md
├── README.md
├── biome.json
├── package.json
└── pnpm-lock.yaml
```

Do not create a monorepo in V1.

---

# 8. Package installation policy

Install dependencies only when needed by an approved task.

The core dependency set is expected to include:

```bash
pnpm add \
  @tanstack/react-query \
  @tanstack/react-virtual \
  zustand \
  zod \
  lucide-react
```

Editor dependencies:

```bash
pnpm add \
  @tiptap/react \
  @tiptap/pm \
  @tiptap/starter-kit \
  @tiptap/extension-link \
  @tiptap/extension-image \
  @tiptap/extension-highlight \
  @tiptap/extension-underline \
  @tiptap/extension-task-list \
  @tiptap/extension-task-item \
  @tiptap/extension-table \
  @tiptap/extension-table-row \
  @tiptap/extension-table-cell \
  @tiptap/extension-table-header \
  @tiptap/extension-placeholder
```

Testing:

```bash
pnpm add -D \
  vitest \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  jsdom \
  @playwright/test
```

Biome:

```bash
pnpm add -D @biomejs/biome
```

Radix packages should be installed individually and only as components require them.

Example:

```bash
pnpm add @radix-ui/react-dialog
```

Never install the entire ecosystem speculatively.

---

# 9. Tauri plugins

Install only the plugins actually needed.

Initial expected plugins:

```text
SQL
filesystem
dialog
clipboard
os
window state
notification (later)
```

SQL must be added before database implementation.

Use the official Tauri plugin installation workflow.

Do not implement a custom Rust SQLite layer unless the plugin becomes insufficient.

---

# 10. Application data location

Persistent data must live in the operating-system application data directory.

Conceptual layout:

```text
NODI/
│
├── nodi.db
├── attachments/
├── thumbnails/
├── backups/
└── logs/
```

The application must never write user data into the Git repository.

All paths must be resolved through Tauri platform APIs.

Do not hardcode:

```text
/Users/<name>/
```

---

# 11. Database configuration

SQLite is the source of truth for structured persistent application data.

At startup configure:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

Use parameterized queries only.

Never concatenate user content directly into SQL.

---

# 12. Migration rules

Migrations live in:

```text
src/db/migrations/
```

Naming convention:

```text
001_initial.sql
002_add_tags.sql
003_add_note_versions.sql
004_add_tasks.sql
```

Rules:

```text
1. migrations are sequential
2. committed migrations are immutable
3. never edit a migration already merged
4. create a new migration for schema changes
5. migrations must be safe to run exactly once
6. migrations must run before repositories become available
7. a backup must be created before risky schema migration
```

The application must store the current schema version.

---

# 13. Initial database schema

The first schema should include only the stable core tables.

## notebooks

```sql
CREATE TABLE notebooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stack_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
```

## notebook_stacks

```sql
CREATE TABLE notebook_stacks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## notes

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  notebook_id TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL,
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id)
);
```

## tags

```sql
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## note_tags

```sql
CREATE TABLE note_tags (
  note_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

## attachments

```sql
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
```

## shortcuts

```sql
CREATE TABLE shortcuts (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
```

## settings

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

# 14. Full-text search schema

Use SQLite FTS5.

Create a virtual table conceptually similar to:

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  content_text,
  tags_text,
  notebook_text
);
```

The exact synchronization strategy may use:

```text
repository-controlled updates
or
database triggers
```

For V1 prefer repository-controlled updates because behavior is easier for AI agents to reason about and test.

FTS updates must happen in the same logical operation as note persistence.

---

# 15. ID generation

Do not use database autoincrement IDs.

Use globally unique string IDs.

Preferred options:

```text
UUID v7
or
ULID
```

Pick one and record the decision in `docs/DECISIONS.md`.

The ID must be generated before persistence.

This supports future sync without schema redesign.

---

# 16. Device ID

Generate one stable local device ID during first launch.

Store it in settings.

Every created note gets:

```text
device_id
revision
updated_at
```

Do not implement sync yet.

These fields only prepare the schema for later.

---

# 17. Repository pattern

Database access must go through repositories.

Example:

```text
src/db/repositories/noteRepository.ts
```

Expected interface:

```ts
interface NoteRepository {
  create(input: CreateNoteInput): Promise<Note>
  getById(id: string): Promise<Note | null>
  list(input?: NoteListInput): Promise<NoteSummary[]>
  update(id: string, patch: UpdateNoteInput): Promise<Note>
  softDelete(id: string): Promise<void>
  restore(id: string): Promise<void>
  permanentlyDelete(id: string): Promise<void>
}
```

UI components must not execute SQL.

Tiptap editor components must not execute SQL.

Zustand stores must not execute SQL.

---

# 18. React Query responsibilities

Use TanStack Query for persistent application data.

Examples:

```text
notes
notebooks
tags
search results
attachments metadata
```

Use Zustand only for ephemeral interface state.

Examples:

```text
sidebar collapsed
selected inspector tab
panel width
command palette open state
theme preference before persistence sync
```

Do not duplicate server/persistent data inside Zustand.

---

# 19. Initial app providers

`src/app/providers.tsx` should own:

```text
QueryClientProvider
theme provider if needed
global error boundary
application context
```

Keep provider nesting shallow.

Do not create providers for trivial state.

---

# 20. Design tokens

Create `src/styles/tokens.css`.

## Light theme

```css
:root {
  --color-bg: #f7f7f3;
  --color-surface: #ffffff;
  --color-surface-muted: #efefea;

  --color-text: #1b1c1a;
  --color-text-muted: #62655e;

  --color-border: #ddded8;

  --color-accent: #2f6d4f;
  --color-accent-hover: #25563f;
  --color-accent-soft: #ddece4;

  --color-danger: #b94343;

  --sidebar-width: 232px;
  --note-list-width: 320px;
  --editor-max-width: 760px;

  --radius-sm: 6px;
  --radius-md: 9px;
  --radius-lg: 12px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  --transition-fast: 120ms;
  --transition-normal: 180ms;
}
```

## Dark theme

Use attribute-based theming:

```css
[data-theme='dark'] {
  --color-bg: #151715;
  --color-surface: #1c1f1c;
  --color-surface-muted: #242824;

  --color-text: #f2f4f0;
  --color-text-muted: #a9aea6;

  --color-border: #333a34;

  --color-accent: #6db58d;
}
```

Avoid hardcoded colors inside components.

---

# 21. Typography

Use system fonts.

Global UI:

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Text",
  system-ui,
  sans-serif;
```

Monospace:

```css
font-family:
  ui-monospace,
  "SF Mono",
  Menlo,
  monospace;
```

Default editor body:

```text
16px
line-height 1.65
max-width 760px
```

Note title:

```text
30–32px
font-weight 650
```

---

# 22. Desktop layout

The primary desktop shell is three-column.

```text
┌───────────────┬───────────────────┬──────────────────────────────────┐
│ Sidebar       │ Note list         │ Editor                           │
│ 232px         │ 320px             │ flexible                         │
└───────────────┴───────────────────┴──────────────────────────────────┘
```

Widths may be resizable later.

Do not implement panel resizing in the first layout task.

Initial goals:

```text
stable
keyboard accessible
no horizontal overflow
good behavior down to approximately 900px window width
```

---

# 23. Sidebar

Initial sidebar sections:

```text
+ New Note
Search
Notes
Tasks (disabled or hidden until implemented)

SHORTCUTS

NOTEBOOKS

TAGS

Trash
Settings
```

Do not create empty navigation destinations solely for visual completeness.

Features not implemented should either be hidden or explicitly disabled.

---

# 24. Note list

Each list item should contain:

```text
title
plain-text preview
updated timestamp
optional notebook indicator
optional task indicator later
```

The list must support keyboard navigation.

Future list size may reach thousands of notes.

Use TanStack Virtual once list virtualization becomes necessary.

Do not prematurely virtualize during the first note CRUD task if the architecture becomes significantly more complex.

---

# 25. Editor source of truth

Canonical note content is:

```text
Tiptap JSON
```

Store:

```text
content_json
content_text
```

`content_json` is canonical.

`content_text` is generated for:

```text
search
preview
export assistance
```

Do not use Markdown as canonical persistence.

Do not use HTML as canonical persistence.

---

# 26. Initial Tiptap extensions

Initial editor configuration:

```text
StarterKit
Link
Image
Highlight
Underline
TaskList
TaskItem
Table
TableRow
TableCell
TableHeader
Placeholder
```

Do not implement custom extensions before the base editor is stable.

---

# 27. Autosave

Expected flow:

```text
editor transaction
→ local editor state updates immediately
→ debounce approximately 450ms
→ repository.update()
→ content_text regenerated
→ SQLite transaction
→ FTS index updated
→ query cache updated
```

Also force-save:

```text
before switching notes
on editor blur when dirty
when application enters background
before application close if practical
```

The user must never need to press Save.

---

# 28. Dirty state

Maintain explicit dirty state.

Suggested representation:

```text
clean
dirty
saving
error
```

The UI may show subtle status text:

```text
Saving…
Saved
Could not save
```

Avoid persistent visual noise.

---

# 29. Error handling

Persistence errors must never be silently ignored.

Database write failure:

```text
1. keep the current editor state in memory
2. surface a non-destructive error
3. allow retry
4. never clear editor content because persistence failed
```

Prefer application-specific error classes.

Example:

```text
DatabaseError
AttachmentError
MigrationError
ExportError
```

---

# 30. Note creation behavior

`Cmd + N`

Expected behavior:

```text
create empty note
persist immediately
select note
focus editor title/body
```

Do not wait for first keystroke to create the database record.

This prevents temporary unsaved-note state.

---

# 31. Note deletion

Deletion is soft by default.

Set:

```text
deleted_at
```

Do not remove the record.

Trash view lists soft-deleted notes.

Trash actions:

```text
Restore
Delete permanently
Empty Trash
```

Permanent deletion must require confirmation.

---

# 32. Search UX

Primary shortcut:

```text
Cmd + K
```

Open a search surface focused immediately.

Initial query supports:

```text
free text
```

Phase 2 syntax:

```text
tag:
notebook:
created:
updated:
has:
task:
```

Do not build an advanced query language before basic FTS is stable.

---

# 33. Command palette

Shortcut:

```text
Cmd + Shift + P
```

Initial commands:

```text
New note
New notebook
Search
Move note
Add tag
Toggle sidebar
Toggle theme
Open settings
Export current note
```

Commands should be registered centrally.

Suggested file:

```text
src/app/commands.ts
```

---

# 34. Keyboard shortcut registry

Avoid scattered `keydown` handlers.

Create:

```text
src/app/shortcuts.ts
```

Suggested abstraction:

```ts
interface AppShortcut {
  id: string
  keys: string[]
  label: string
  action: () => void
}
```

All global shortcuts should be discoverable from one registry.

---

# 35. Attachments

Binary content must not be stored inside SQLite.

Store files under:

```text
attachments/<prefix>/<sha256>/
```

SQLite stores metadata only.

When attaching:

```text
1. read selected file
2. calculate SHA-256
3. copy to application attachment directory
4. persist metadata
5. insert attachment node/reference into editor
```

Duplicate content may reuse the same stored binary later.

Deduplication is optional for V1.

---

# 36. Backup strategy

Backup is part of reliability, not a premium feature.

Initial automatic policy:

```text
daily backups: keep last 7
weekly backups: keep last 4
```

Backup must include:

```text
SQLite database
attachments
```

A manifest file is recommended.

Example:

```json
{
  "createdAt": "...",
  "schemaVersion": 4,
  "appVersion": "...",
  "database": "nodi.db",
  "attachmentsIncluded": true
}
```

Before a schema migration that could affect user data:

```text
create backup
then migrate
```

---

# 37. Export

Initial export formats:

```text
Markdown
HTML
JSON library backup
```

Later:

```text
PDF
ENEX-compatible export if justified
```

Export must never mutate source notes.

---

# 38. Testing architecture

## Unit tests

Prioritize:

```text
repositories
search parser
note text extraction
ID utilities
backup manifest logic
date formatting
migration helpers
```

## Component tests

Prioritize:

```text
note list
sidebar
tag selector
dialogs
search UI
editor toolbar
```

## E2E

Core flows:

```text
launch app
create note
type content
restart app
verify persistence

create notebook
move note
restart
verify notebook relation

search for note
delete note
restore note

attach image
restart
verify attachment

export note
```

---

# 39. Mandatory persistence test

Maintain at least one test covering:

```text
create data
close app
reopen app
verify data
```

Data loss is severity critical.

---

# 40. Accessibility requirements

Every implementation task must consider:

```text
keyboard operation
visible focus
semantic elements
ARIA only when needed
screen-reader labels
contrast
reduced motion
logical tab order
```

Radix primitives are preferred for:

```text
dialogs
menus
popovers
selects
tooltips
context menus
```

Do not build custom accessibility-heavy primitives unless necessary.

---

# 41. Performance rules

Do not optimize speculative bottlenecks.

However the following rules are mandatory:

```text
attachments outside SQLite
FTS5 for full-text search
no rendering of huge lists without virtualization
avoid unnecessary React global state
do not serialize the entire library on each update
do not re-query all notes after every keystroke
```

Prefer targeted query invalidation.

---

# 42. Application startup sequence

Conceptual startup flow:

```text
Tauri application starts
↓
resolve app data directory
↓
ensure folders exist
↓
open SQLite
↓
apply PRAGMAs
↓
create pre-migration backup if required
↓
run migrations
↓
load settings
↓
initialize repositories
↓
render React application
↓
restore last selected note/window state
```

Never render an operational editor before migrations complete.

---

# 43. Last-session restore

Persist lightweight session information:

```text
selected note ID
sidebar collapsed state
window size/position
theme
last selected notebook/filter
```

On reopen:

```text
restore valid state
fallback safely if referenced note no longer exists
```

---

# 44. Theme behavior

Support:

```text
System
Light
Dark
```

Default:

```text
System
```

Persist user choice.

The editor and dialogs must use the same design tokens.

---

# 45. Logging

Initial logging must stay local.

Log:

```text
startup
migration failures
database failures
backup failures
unexpected uncaught errors
```

Do not log:

```text
note content
attachment contents
sensitive user text
```

No remote logging SDK in V1.

---

# 46. Security baseline

Even though V1 is local-only:

```text
parameterize SQL
validate file paths
do not execute attachment content
sanitize exported HTML where required
restrict Tauri capabilities to actual needs
avoid broad filesystem permissions
do not store secrets in source
```

Security should be reviewed before any future sync implementation.

---

# 47. Agent architecture

Use three permanent agents.

## Planner

Location:

```text
.agents/planner.md
```

Responsibilities:

```text
understand requested feature
inspect only relevant implementation
define smallest safe vertical slice
identify files
define acceptance criteria
identify tests
avoid unrelated refactors
```

Planner does not implement production code.

---

# 48. Builder agent

Location:

```text
.agents/builder.md
```

Responsibilities:

```text
implement exactly one approved task
read only necessary files
follow existing architecture
avoid unrelated changes
run checks
report changed files
report unresolved issues
```

Expected final response format:

```text
1. Summary
2. Files changed
3. Verification
4. Remaining issues
```

---

# 49. Verifier agent

Location:

```text
.agents/verifier.md
```

Responsibilities:

```text
review diff
run relevant tests
check correctness
check data integrity
check accessibility
check regressions
check performance
check unnecessary complexity
```

Verifier does not redesign the architecture.

---

# 50. Specialized agents

Optional:

```text
ui-auditor
database-auditor
security-auditor
```

Invoke only when relevant.

Examples:

```text
new migration → database-auditor
complex dialog → ui-auditor
sync/auth → security-auditor
```

Do not run all auditors on every task.

---

# 51. AGENTS.md contract

`AGENTS.md` should be concise.

Minimum project rules:

```text
- Read the active task before touching code.
- Tauri + React + TypeScript is the application stack.
- SQLite is the persistent structured source of truth.
- Tiptap JSON is canonical note content.
- Attachments live outside SQLite.
- No backend exists in V1.
- No cloud dependency may be introduced without explicit approval.
- Do not refactor unrelated code.
- Do not add dependencies without justification.
- Prefer existing abstractions.
- Migrations are immutable after commit.
- Persistent data changes require tests.
- Accessibility is mandatory.
- Run the project validation command before completion.
```

---

# 52. Task format

Every implementation task should follow:

```markdown
# TASK-ID

## Goal
One clear outcome.

## Context
Only relevant implementation context.

## Scope
Files/features allowed to change.

## Acceptance criteria
- measurable behavior
- measurable behavior
- measurable behavior

## Non-goals
- explicitly excluded work

## Verification
- command
- command
```

---

# 53. Vibe-coding token economy

Coding agents must not start with:

```text
Read the entire repository.
```

Preferred pattern:

```text
Locate the implementation responsible for X.
Read only the relevant files and referenced architecture documents.
Implement TASK-ID without touching unrelated code.
```

Never use prompts like:

```text
Review the whole project and improve everything.
```

Large unspecific prompts create:

```text
token waste
architecture drift
unnecessary refactors
higher regression risk
```

---

# 54. Dependency approval rule

If an agent wants a new dependency it must explain:

```text
package
purpose
why existing stack cannot solve the problem cleanly
bundle/runtime impact
maintenance implication
```

Small utilities should often be implemented locally rather than imported.

---

# 55. Refactor policy

A refactor is a separate task.

Feature tasks must not include unrelated cleanup.

Bad:

```text
Implemented note tagging and also reorganized the repository layer.
```

Good:

```text
TAG-012 implemented note tagging only.
```

If repository cleanup is needed:

```text
REF-007 Simplify note repository
```

---

# 56. Definition of Done

A task is done only when:

```text
✓ acceptance criteria satisfied
✓ TypeScript passes
✓ lint passes
✓ relevant tests pass
✓ no known data integrity problem
✓ keyboard interaction works
✓ accessibility checked
✓ dark/light theme unaffected
✓ no unrelated files changed
✓ no unexplained dependency added
✓ persistent behavior tested when relevant
✓ docs updated when architecture changed
✓ current NODI window captured for the visual evolution log
✓ ABOUT page updated with a chronological task entry
```

---

# 57. Recommended package scripts

Normalize package scripts to something similar to:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "tauri": "tauri",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "check": "pnpm typecheck && pnpm lint && pnpm test"
  }
}
```

Builder agents must run:

```bash
pnpm check
```

before claiming completion.

---

# 58. Commit strategy

Prefer small atomic commits.

Examples:

```text
chore: bootstrap tauri project
chore: configure biome and vitest
feat(db): add sqlite bootstrap
feat(notes): add note repository
feat(notes): add note creation flow
feat(editor): add tiptap editor
feat(search): add fts5 index
fix(notes): preserve dirty editor state on save failure
```

Avoid commits such as:

```text
misc changes
updates
cleanup
final fixes
```

---

# 59. Branching

For personal AI-first development, keep branching simple.

Recommended:

```text
main
feature/<task-id>-short-name
fix/<task-id>-short-name
```

Examples:

```text
feature/NOTE-003-create-note
feature/SEARCH-002-fts5
fix/NOTE-019-autosave-race
```

One task per branch when practical.

---

# 60. Phase 0 — Foundation

## FND-001 Repository bootstrap

Goal:

```text
Create a clean Tauri + React + TypeScript application.
```

Acceptance:

```text
app launches
React renders
Tauri dev works
Git repository clean
```

---

## FND-002 Tooling

Add:

```text
Biome
Vitest
React Testing Library
Playwright
```

Acceptance:

```bash
pnpm check
```

passes.

---

## FND-003 Project structure

Create initial folder structure.

Acceptance:

```text
no circular architecture
no empty speculative abstractions
imports remain understandable
```

---

## FND-004 Design tokens

Implement:

```text
light theme
dark theme
system theme
typography
spacing
borders
radii
```

Acceptance:

```text
no hardcoded theme colors in initial layout components
```

---

## FND-005 Desktop shell

Implement three-column layout.

Acceptance:

```text
sidebar 232px
note list 320px
editor flexible
stable window resizing
keyboard focus visible
```

---

# 61. Phase 1 — Persistence

## DB-001 SQLite connection

Add Tauri SQL plugin.

Acceptance:

```text
database opens in app data directory
PRAGMAs applied
connection failure is surfaced
```

---

## DB-002 Migration runner

Implement schema version tracking.

Acceptance:

```text
fresh install creates schema
second launch does not re-run applied migration
migration failure stops normal app startup
```

---

## DB-003 Device ID

Create stable local device ID.

Acceptance:

```text
generated once
persisted across restarts
used in note creation
```

---

# 62. Phase 2 — Notes

## NOTE-001 Note repository

Implement:

```text
create
read
list
update
soft delete
restore
permanent delete
```

Acceptance:

```text
repository tests
parameterized SQL
timestamps correct
revision increments on update
```

---

## NOTE-002 Notes list

Render notes from repository via TanStack Query.

Acceptance:

```text
latest updated first
selected state visible
empty state exists
loading state exists
error state exists
```

---

## NOTE-003 New note

Implement `Cmd + N`.

Acceptance:

```text
note persisted immediately
new note selected
editor focused
list updates without restart
```

---

# 63. Phase 3 — Editor

## EDIT-001 Tiptap base editor

Configure required extensions.

Acceptance:

```text
paragraphs
headings
bold
italic
underline
lists
links
highlight
task list
tables
```

---

## EDIT-002 Note title

Implement editable title.

Acceptance:

```text
title persisted
note list updates
empty title gracefully displayed as Untitled
```

---

## EDIT-003 Autosave

Implement debounce persistence.

Acceptance:

```text
typing does not write on every keystroke
save runs after inactivity
switching note flushes pending changes
restart preserves latest content
```

---

## EDIT-004 Save error recovery

Acceptance:

```text
failed save does not clear editor
error state visible
retry possible
```

---

# 64. Phase 4 — Trash

## TRASH-001 Soft deletion

Acceptance:

```text
deleted note disappears from normal list
appears in Trash
content preserved
```

---

## TRASH-002 Restore

Acceptance:

```text
restored note returns to original context
```

---

## TRASH-003 Permanent delete

Acceptance:

```text
confirmation required
attachments cleaned safely
FTS entry removed
record deleted
```

---

# 65. Phase 5 — Organization

## NB-001 Notebooks

Implement notebook CRUD.

---

## NB-002 Move note

Acceptance:

```text
notebook selector
selection persisted
list updates
keyboard accessible
```

---

## NB-003 Notebook stacks

Add grouping.

Do not implement drag-and-drop until basic stack CRUD is stable.

---

## TAG-001 Tags

Implement tag CRUD.

---

## TAG-002 Note tags

Acceptance:

```text
multiple tags
add/remove
searchable
keyboard accessible
```

---

## SHORT-001 Favorites

Allow notes/notebooks to appear in Shortcuts.

---

# 66. Phase 6 — Search

## SEARCH-001 FTS5 index

Acceptance:

```text
title indexed
content_text indexed
tag text indexed
notebook text indexed
```

---

## SEARCH-002 Basic search UI

Shortcut:

```text
Cmd + K
```

Acceptance:

```text
instant focus
results ordered by relevance
keyboard navigation
enter opens result
escape closes
```

---

## SEARCH-003 Search filters

Add parser incrementally:

```text
tag:
notebook:
created:
updated:
```

No natural-language semantic search yet.

---

## SEARCH-004 Saved searches

Only after the filter parser is stable.

---

# 67. Phase 7 — Rich knowledge

## LINK-001 Internal note links

Implement stable:

```text
nodi://note/<id>
```

or equivalent internal representation.

---

## LINK-002 Backlinks

Derive backlinks from internal note links.

Prefer indexed relationship table when scale justifies it.

---

## TEMP-001 Templates

Allow note creation from a saved template.

---

## HIST-001 Note versions

Create lightweight snapshot history.

Avoid snapshot per keystroke.

Suggested trigger:

```text
manual milestone
significant idle save interval
before destructive replacement
```

---

# 68. Phase 8 — Attachments

## ATT-001 File storage

Create attachment directories safely.

---

## ATT-002 File metadata

Persist attachment records.

---

## ATT-003 Image insertion

Allow:

```text
file picker
drag-and-drop
paste
```

---

## ATT-004 General files

Support PDF and arbitrary document attachments.

Preview may be deferred.

---

# 69. Phase 9 — Reliability

## BACKUP-001 Manual backup

Acceptance:

```text
database included
attachments included
manifest included
restore tested
```

---

## BACKUP-002 Automatic backups

Implement retention:

```text
7 daily
4 weekly
```

---

## EXPORT-001 Markdown export

---

## EXPORT-002 HTML export

---

## EXPORT-003 Full library export

Use a documented portable format.

---

# 70. Phase 10 — Productivity

## CMD-001 Command palette

Shortcut:

```text
Cmd + Shift + P
```

---

## TASK-001 Tasks in notes

Initially use Tiptap task items.

Do not create a global task database until task aggregation is needed.

---

## TASK-002 Global Tasks view

Only after task extraction/indexing design is documented.

---

## REM-001 Reminders

Use local OS notifications.

No remote push infrastructure.

---

# 71. Phase 11 — Capture

## CAP-001 Quick note

Implement minimal fast note capture.

---

## CAP-002 Menu bar capture

macOS-specific optional feature.

---

## CAP-003 Clipboard capture

Optional.

---

## CAP-004 Web clipper

Deferred because it requires browser-extension architecture.

Treat as separate project/package when started.

---

# 72. Phase 12 — Multi-device

Do not begin until V1 local reliability is proven.

Required architecture design before coding:

```text
sync protocol
identity
device model
conflict resolution
attachment sync
deletion propagation
offline queue
retry behavior
schema compatibility
encryption model
```

Only then evaluate:

```text
iCloud
CloudKit
Supabase
custom API
other providers
```

No provider is preselected.

---

# 73. Phase 13 — AI / premium-class features

Explicitly postponed:

```text
AI assistant
semantic search
local embeddings
cloud embeddings
transcription
OCR
smart summarization
calendar integrations
email integrations
Google Drive
Slack
real-time collaboration
public sharing
SSO
admin features
```

Each must receive its own architecture evaluation before implementation.

---

# 74. Features that may create real financial cost

Track these separately in `docs/PRODUCT.md`.

Likely paid or potentially paid:

```text
cloud sync/storage
public sharing hosting
email ingestion
AI inference
transcription APIs
OCR cloud APIs
vector databases
push infrastructure at scale
analytics SaaS
error monitoring SaaS
collaboration servers
calendar integrations at production scale
```

Do not implement a paid dependency silently.

---

# 75. Recommended VS Code workflow

Open the repository root.

Maintain these files permanently visible/searchable:

```text
IMPLEMENTATION.md
AGENTS.md
docs/TASKS.md
docs/DECISIONS.md
```

For each feature:

```text
1. create or select a TASK-ID
2. ask Planner to inspect only relevant areas
3. review the task plan
4. give Builder the approved task
5. Builder runs pnpm check
6. run the app manually
7. capture only the current NODI window
8. add the screenshot and task summary to ABOUT
9. Human reviews product behavior
10. Verifier reviews diff
11. fix only blocking issues
12. commit
```

---

# 76. Prompt — Planner

Use this template:

```text
You are the Planner for NODI.

Read:
- AGENTS.md
- IMPLEMENTATION.md
- docs/ARCHITECTURE.md only if relevant
- docs/DATA_MODEL.md only if relevant
- the current task context

Do not read the entire repository.

Locate the files responsible for the requested behavior.

Create the smallest safe implementation plan.

Return:
1. goal
2. relevant current behavior
3. files that likely need changes
4. implementation steps
5. acceptance criteria
6. tests
7. explicit non-goals
8. risks

Do not implement production code.
Do not propose unrelated refactors.
```

---

# 77. Prompt — Builder

```text
You are the Builder for NODI.

Implement exactly TASK-ID.

Read:
- AGENTS.md
- IMPLEMENTATION.md
- the approved task
- only the source files required for this task
- relevant architecture documentation only when needed

Rules:
- do not refactor unrelated code
- do not add dependencies unless explicitly required
- do not change architecture silently
- preserve existing behavior
- use existing abstractions
- maintain accessibility
- protect persistent user data

Before finishing run:
pnpm check

Run relevant focused tests as well.

Return:
1. summary
2. files changed
3. verification performed
4. unresolved issues
```

---

# 78. Prompt — Verifier

```text
You are the Verifier for NODI.

Review the current task implementation.

Read:
- AGENTS.md
- task acceptance criteria
- the diff
- only source files required to understand the diff

Check:
- correctness
- regressions
- data integrity
- persistence
- accessibility
- edge cases
- error handling
- unnecessary complexity
- dependency changes
- performance regressions

Run appropriate tests.

Do not redesign the architecture.

Return:
1. blocking issues
2. non-blocking observations
3. verification performed
4. approval status

If there is a problem, recommend the smallest safe correction.
```

---

# 79. Prompt — Database Auditor

```text
Review only the database implications of the current change.

Verify:
- migration safety
- backward compatibility
- constraints
- indexes
- transaction boundaries
- FTS consistency
- deletion behavior
- data-loss risks
- rollback/recovery implications

Do not propose unrelated schema redesign.
```

---

# 80. Prompt — UI Auditor

```text
Review only the UI/UX implementation of the current task.

Verify:
- keyboard use
- focus states
- screen reader semantics
- loading/error/empty states
- theme consistency
- visual hierarchy
- density
- destructive-action safety
- unnecessary UI complexity

Do not redesign unrelated screens.
```

---

# 81. Human reviewer checklist

The human reviewer does not need to review every implementation line.

For each feature verify:

```text
Does it do exactly what was requested?
Does it feel native and predictable?
Can it be used with keyboard?
Does data survive restart?
Are errors understandable?
Did anything unrelated change?
Does dark mode still work?
Does resizing the window break the UI?
Is the behavior simpler than the implementation suggests?
```

When something feels wrong, create a focused follow-up task.

Avoid broad prompts such as:

```text
make it better
```

Prefer:

```text
The selected note loses keyboard focus after moving between notebooks.
Fix only this regression.
```

---

# 82. First implementation sequence

Do not skip ahead.

Recommended exact sequence:

```text
001 FND-001 Repository bootstrap
002 FND-002 Tooling
003 FND-003 Project structure
004 FND-004 Design tokens
005 FND-005 Desktop shell
006 DB-001 SQLite connection
007 DB-002 Migration runner
008 DB-003 Device ID
009 NOTE-001 Note repository
010 NOTE-002 Notes list
011 NOTE-003 New note
012 EDIT-001 Tiptap base editor
013 EDIT-002 Note title
014 EDIT-003 Autosave
015 EDIT-004 Save error recovery
016 TRASH-001 Soft deletion
017 TRASH-002 Restore
018 SEARCH-001 FTS5
019 SEARCH-002 Search UI
020 NB-001 Notebooks
021 NB-002 Move note
022 TAG-001 Tags
023 TAG-002 Note tags
024 ATT-001 File storage
025 ATT-002 File metadata
026 ATT-003 Image insertion
027 BACKUP-001 Manual backup
028 BACKUP-002 Automatic backups
029 EXPORT-001 Markdown export
030 EXPORT-002 HTML export
```

At this point NODI should already be useful as a serious personal notes application.

---

# 83. Milestone gates

## Milestone A — Native shell

Must satisfy:

```text
Tauri app opens
themes work
layout stable
tests configured
```

---

## Milestone B — Reliable notes

Must satisfy:

```text
create
edit
autosave
restart
restore state
delete
restore
```

Do not continue if persistence is unreliable.

---

## Milestone C — Organization

Must satisfy:

```text
notebooks
tags
shortcuts
search
```

---

## Milestone D — Knowledge tool

Must satisfy:

```text
attachments
internal links
backlinks
templates
history
tasks
```

---

## Milestone E — Trustworthy personal app

Must satisfy:

```text
backup
restore
export
migration tests
error recovery
performance review
accessibility review
```

Only after Milestone E should multi-device sync become a serious implementation candidate.

---

# 84. Non-negotiable rules

```text
1. Never lose user data silently.
2. Never require the internet for core note usage.
3. Never store binary attachments inside SQLite.
4. Never use Markdown as canonical editor storage.
5. Never let UI components execute raw SQL.
6. Never mutate old committed migrations.
7. Never add cloud infrastructure speculatively.
8. Never add AI APIs to core flows.
9. Never let agents refactor unrelated code.
10. Never skip persistence testing for persistent features.
11. Never hide database errors.
12. Never install dependencies without a clear reason.
13. Never treat successful compilation as sufficient validation.
14. Never implement sync before local reliability is proven.
15. Never finish an implementation task without preserving its screen state in ABOUT.
```

---

# 85. Success criterion for V1

V1 is successful when the application can replace a conventional personal notes app for daily use on the Mac without external services.

The user must be able to:

```text
open the app
create a note immediately
write rich text
organize notes
attach files
find any note quickly
delete and restore safely
close the app
reopen it
trust that everything remains there
back up the library
export content
```

Everything else is secondary.

---

# 86. First command for the coding agent

After all permanent documentation files exist, the first implementation prompt should be:

```text
Implement FND-001 from IMPLEMENTATION.md.

Do not implement later tasks.

Create the cleanest possible Tauri 2 + React + TypeScript baseline for NODI.

Follow AGENTS.md.

Acceptance:
- app launches successfully on macOS
- repository has no unnecessary dependencies
- project can be started with pnpm tauri dev
- Git working tree is understandable
- no product features are implemented yet

At completion:
- run the relevant validation commands
- report changed files
- report any setup requirement that cannot be automated
```

---

# 87. Final project mindset

NODI should be built as a sequence of small vertical slices.

The preferred pattern is:

```text
one task
one behavior
small diff
automated verification
human UI review
commit
```

Avoid:

```text
large rewrites
architectural speculation
premature cloud integration
premature mobile work
large agent swarms
broad unspecific prompts
```

The project should remain understandable enough that a new coding agent can become productive by reading:

```text
AGENTS.md
IMPLEMENTATION.md
one relevant architecture document
one active task
a small set of source files
```

If an agent needs the full repository and the entire conversation history to understand a small task, the architecture or documentation has become too implicit and must be corrected.

---

# 88. Visual evolution documentation

The project must preserve a chronological visual history inside `ABOUT`.

At the end of every implementation task, after validation and before the task commit:

```text
1. run the native macOS application
2. navigate to the primary screen affected by the task
3. capture only the NODI window
4. store the image under docs/about/screenshots/
5. add a chronological entry to docs/ABOUT.md
6. add the same entry to the in-app ABOUT page
7. verify that the screenshot renders and has useful alternative text
```

Screenshot naming convention:

```text
<task-id-lowercase>-<short-description>.png
```

Example:

```text
fnd-001-native-shell.png
note-003-new-note.png
search-002-search-results.png
```

Each ABOUT entry must contain:

```text
task ID
completion date
short title
one concise description of the visible evolution
screenshot
commit hash when available
```

Rules:

```text
screenshots are permanent historical artifacts
never replace or rewrite an earlier screenshot
capture only the app window, never the full desktop
do not include real or sensitive user content
use representative local fixture content when a feature needs data
non-visual tasks still receive a screenshot and an explanation of the invisible change
the in-app ABOUT page must use the same design tokens and accessibility standards as NODI
the ABOUT timeline must remain chronological and usable with keyboard and screen readers
```

The visual record is part of the Definition of Done, not an optional release note.

import db001Screenshot from "../../../docs/about/screenshots/db-001-sqlite-connection.png";
import db002Screenshot from "../../../docs/about/screenshots/db-002-migration-runner.png";
import db003Screenshot from "../../../docs/about/screenshots/db-003-device-id.png";
import doc001Screenshot from "../../../docs/about/screenshots/doc-001-about-rule.png";
import edit001Screenshot from "../../../docs/about/screenshots/edit-001-tiptap-base-editor.png";
import edit002Screenshot from "../../../docs/about/screenshots/edit-002-note-title.png";
import edit003Screenshot from "../../../docs/about/screenshots/edit-003-autosave.png";
import edit004Screenshot from "../../../docs/about/screenshots/edit-004-save-error-recovery.png";
import fnd001Screenshot from "../../../docs/about/screenshots/fnd-001-native-shell.png";
import fnd002Screenshot from "../../../docs/about/screenshots/fnd-002-tooling.png";
import fnd003Screenshot from "../../../docs/about/screenshots/fnd-003-project-structure.png";
import fnd004DarkScreenshot from "../../../docs/about/screenshots/fnd-004-dark-mode.png";
import fnd004Screenshot from "../../../docs/about/screenshots/fnd-004-design-tokens.png";
import fnd005Screenshot from "../../../docs/about/screenshots/fnd-005-desktop-shell.png";
import nb001Screenshot from "../../../docs/about/screenshots/nb-001-notebooks.png";
import nb002Screenshot from "../../../docs/about/screenshots/nb-002-move-note.png";
import nb003Screenshot from "../../../docs/about/screenshots/nb-003-notebook-stacks.png";
import note001Screenshot from "../../../docs/about/screenshots/note-001-note-repository.png";
import note002Screenshot from "../../../docs/about/screenshots/note-002-notes-list.png";
import note003Screenshot from "../../../docs/about/screenshots/note-003-new-note.png";
import privacy001Screenshot from "../../../docs/about/screenshots/privacy-001-private-notes.png";
import search001Screenshot from "../../../docs/about/screenshots/search-001-fts-index.png";
import search002Screenshot from "../../../docs/about/screenshots/search-002-basic-search.png";
import search003Screenshot from "../../../docs/about/screenshots/search-003-filters.png";
import search004Screenshot from "../../../docs/about/screenshots/search-004-saved-searches.png";
import short001Screenshot from "../../../docs/about/screenshots/short-001-favorites.png";
import tag001Screenshot from "../../../docs/about/screenshots/tag-001-tags.png";
import tag002Screenshot from "../../../docs/about/screenshots/tag-002-note-tags.png";
import trash001Screenshot from "../../../docs/about/screenshots/trash-001-soft-deletion.png";
import trash002Screenshot from "../../../docs/about/screenshots/trash-002-restore.png";
import trash003Screenshot from "../../../docs/about/screenshots/trash-003-permanent-delete.png";
import ui001Screenshot from "../../../docs/about/screenshots/ui-001-interface-polish.png";
import ui002Screenshot from "../../../docs/about/screenshots/ui-002-sidebar-library.png";
import ui003Screenshot from "../../../docs/about/screenshots/ui-003-brand-assets.png";
import ui004Screenshot from "../../../docs/about/screenshots/ui-004-reference-editor.png";
import ui005Screenshot from "../../../docs/about/screenshots/ui-005-reference-sidebar.png";
import ui006Screenshot from "../../../docs/about/screenshots/ui-006-system-section.png";
import ui007Screenshot from "../../../docs/about/screenshots/ui-007-settings-relocated.png";
import ui008Screenshot from "../../../docs/about/screenshots/ui-008-compact-lists.png";

interface AboutProps {
  onClose: () => void;
}

const evolution = [
  {
    id: "FND-001",
    title: "Native shell",
    date: "September 7, 2026",
    description:
      "The first NODI window: a clean Tauri 2, React, TypeScript, and Vite baseline running natively on macOS.",
    screenshot: fnd001Screenshot,
  },
  {
    id: "DOC-001",
    title: "Visual history becomes part of NODI",
    date: "September 7, 2026",
    description:
      "ABOUT was added as a permanent, accessible timeline, and visual documentation became part of every task's Definition of Done.",
    screenshot: doc001Screenshot,
  },
  {
    id: "FND-002",
    title: "A reliable development loop",
    date: "September 7, 2026",
    description:
      "The interface remains intentionally stable while type checking, linting, component tests, and browser-level tests now protect every next step.",
    screenshot: fnd002Screenshot,
  },
  {
    id: "FND-003",
    title: "Clear project boundaries",
    date: "September 7, 2026",
    description:
      "The visible baseline stays stable while application startup, global styles, and ABOUT move into clear, one-directional project layers.",
    screenshot: fnd003Screenshot,
  },
  {
    id: "FND-004",
    title: "A visual foundation",
    date: "September 7, 2026",
    description:
      "NODI gains shared design tokens and accessible System, Light, and Dark themes that persist across launches and also style ABOUT.",
    screenshot: fnd004Screenshot,
  },
  {
    id: "FND-004 · DARK",
    title: "The visual history after dark",
    date: "September 7, 2026",
    description:
      "The ABOUT timeline and its historical screenshots remain readable and visually consistent in NODI's Dark theme.",
    screenshot: fnd004DarkScreenshot,
  },
  {
    id: "FND-005",
    title: "The NODI workspace appears",
    date: "September 7, 2026",
    description:
      "The native window becomes a stable three-column workspace with a 232px sidebar, 320px note list, and flexible editor canvas.",
    screenshot: fnd005Screenshot,
  },
  {
    id: "DB-001",
    title: "A local source of truth",
    date: "September 7, 2026",
    description:
      "NODI now opens its SQLite database in the macOS application data directory and applies foreign keys, WAL, and a five-second busy timeout before the workspace becomes available.",
    screenshot: db001Screenshot,
  },
  {
    id: "DB-002",
    title: "A schema that evolves safely",
    date: "September 7, 2026",
    description:
      "The local database now applies one immutable, transactional initial migration before the workspace opens, records version 1, and skips it on subsequent launches.",
    screenshot: db002Screenshot,
  },
  {
    id: "DB-003",
    title: "A stable local identity",
    date: "September 7, 2026",
    description:
      "Each NODI installation now generates one UUID v7, persists it in settings, and reuses it when stamping every new note for future-safe revision tracking.",
    screenshot: db003Screenshot,
  },
  {
    id: "NOTE-001",
    title: "One safe path to every note",
    date: "September 7, 2026",
    description:
      "A parameterized repository now owns note creation, reading, listing, updates, soft deletion, restoration, and permanent deletion, with correct timestamps and revision increments.",
    screenshot: note001Screenshot,
  },
  {
    id: "NOTE-002",
    title: "The library comes alive",
    date: "September 7, 2026",
    description:
      "The middle column now reads notes through TanStack Query, presents loading, empty, and recoverable error states, and supports accessible keyboard selection in recency order.",
    screenshot: note002Screenshot,
  },
  {
    id: "NOTE-003",
    title: "A note in one gesture",
    date: "September 7, 2026",
    description:
      "New note and Command-N persist immediately, refresh the list, select the new record, and place the caret in its writing surface without restarting NODI.",
    screenshot: note003Screenshot,
  },
  {
    id: "EDIT-001",
    title: "The writing surface",
    date: "September 7, 2026",
    description:
      "Tiptap now renders canonical JSON with NODI's complete base extension set and an accessible toolbar for text, lists, links, highlights, tasks, and tables.",
    screenshot: edit001Screenshot,
  },
  {
    id: "EDIT-002",
    title: "Every note can name itself",
    date: "September 7, 2026",
    description:
      "The title is now an editable field that persists on blur or Enter, refreshes the library immediately, preserves failed drafts, and still presents an empty value gracefully as Untitled.",
    screenshot: edit002Screenshot,
  },
  {
    id: "EDIT-003",
    title: "Writing saves itself",
    date: "September 7, 2026",
    description:
      "Editor transactions stay immediate in memory, then persist canonical Tiptap JSON and regenerated plain text after 450 ms of inactivity, with forced flushes on blur, note switch, background, and close.",
    screenshot: edit003Screenshot,
  },
  {
    id: "EDIT-004",
    title: "A failed write never erases a thought",
    date: "September 7, 2026",
    description:
      "Save failures now keep the full draft in memory, announce a non-destructive error beside the editor, and provide an explicit retry path for both body and title.",
    screenshot: edit004Screenshot,
  },
  {
    id: "TRASH-001",
    title: "Deleted does not mean lost",
    date: "September 7, 2026",
    description:
      "Move to Trash now removes a note from the active library, preserves its complete record and content, and exposes it in a dedicated, keyboard-accessible Trash view.",
    screenshot: trash001Screenshot,
  },
  {
    id: "TRASH-002",
    title: "A note can come back whole",
    date: "September 7, 2026",
    description:
      "Selecting a trashed note now exposes Restore note, which clears its deletion marker, increments its revision, and returns the complete note to the active library.",
    screenshot: trash002Screenshot,
  },
  {
    id: "TRASH-003",
    title: "Permanent means deliberate",
    date: "September 7, 2026",
    description:
      "Permanent deletion now requires an explicit confirmation, then removes the note and atomically cleans its attachment metadata, tag relationships, and full-text search entry.",
    screenshot: trash003Screenshot,
  },
  {
    id: "NB-001",
    title: "A place for every project",
    date: "September 7, 2026",
    description:
      "The sidebar now owns a complete, keyboard-accessible notebook workflow: create, list, rename, confirm deletion, recover from errors, and persist every change locally.",
    screenshot: nb001Screenshot,
  },
  {
    id: "NB-002",
    title: "Notes find their context",
    date: "September 7, 2026",
    description:
      "A keyboard-accessible selector now moves notes between notebooks and the unfiled library, persists the relationship, and refreshes filtered lists immediately.",
    screenshot: nb002Screenshot,
  },
  {
    id: "NB-003",
    title: "Projects gather into stacks",
    date: "September 7, 2026",
    description:
      "Notebook stacks now support a complete local lifecycle and group notebooks visibly in the sidebar, with an accessible selector for moving notebooks and safe unlinking when a stack is deleted.",
    screenshot: nb003Screenshot,
  },
  {
    id: "TAG-001",
    title: "A lightweight vocabulary",
    date: "September 7, 2026",
    description:
      "Tags now have a complete local lifecycle in the sidebar, with alphabetical listing, keyboard-friendly creation and renaming, confirmed deletion, uniqueness protection, and clear error recovery.",
    screenshot: tag001Screenshot,
  },
  {
    id: "TAG-002",
    title: "Ideas connect across notebooks",
    date: "September 7, 2026",
    description:
      "Notes can now carry multiple tags, add or remove them without touching content, and appear instantly in a keyboard-accessible tag-filtered library.",
    screenshot: tag002Screenshot,
  },
  {
    id: "SHORT-001",
    title: "What matters stays close",
    date: "September 7, 2026",
    description:
      "Notes and notebooks can now be starred into a persistent Shortcuts section, opened in one action, removed without affecting their source, and cleaned automatically when a target is deleted.",
    screenshot: short001Screenshot,
  },
  {
    id: "SEARCH-001",
    title: "Every word becomes findable",
    date: "September 7, 2026",
    description:
      "A synchronized FTS5 projection now indexes every note title, plain-text body, tag, and notebook, backfills existing data, tracks mutations through database triggers, and ranks matching notes by relevance.",
    screenshot: search001Screenshot,
  },
  {
    id: "SEARCH-002",
    title: "The library is one shortcut away",
    date: "September 7, 2026",
    description:
      "Command-K now opens a focused search surface with relevance-ranked results, accessible arrow navigation, Enter to open, Escape to close, and safe prefix matching across the synchronized index.",
    screenshot: search002Screenshot,
  },
  {
    id: "SEARCH-003",
    title: "Search gains a precise language",
    date: "September 7, 2026",
    description:
      "Search now parses visible, composable tag, notebook, created-date, and updated-date filters while preserving free-text relevance ranking and binding every value safely in SQLite.",
    screenshot: search003Screenshot,
  },
  {
    id: "UI-001",
    title: "More room for the work",
    date: "September 8, 2026",
    description:
      "NODI's workspace now removes redundant chrome, centers theme controls, gathers About under Settings, replaces row actions with accessible icons, refines metadata selectors, and moves formatting into a compact floating menu.",
    screenshot: ui001Screenshot,
  },
  {
    id: "UI-002",
    title: "A workspace that gets out of the way",
    date: "September 8, 2026",
    description:
      "NODI's name returns to the sidebar beside Settings, icon controls explain themselves with tooltips, and the Library can collapse into a small restore control whenever the writing surface needs more room.",
    screenshot: ui002Screenshot,
  },
  {
    id: "UI-003",
    title: "NODI finds its mark",
    date: "September 8, 2026",
    description:
      "The new feather mark now anchors NODI's sidebar and startup screen, while a complete native icon set carries the same identity across desktop and mobile application targets.",
    screenshot: ui003Screenshot,
  },
  {
    id: "UI-004",
    title: "Formatting appears in context",
    date: "September 8, 2026",
    description:
      "A calmer, structured workspace brings NODI closer to a focused desktop tool, while formatting now appears in a compact contextual toolbar only when text is selected.",
    screenshot: ui004Screenshot,
  },
  {
    id: "SEARCH-004",
    title: "Useful searches stay close",
    date: "September 8, 2026",
    description:
      "Named searches now persist locally in SQLite and live in the sidebar. Opening one restores its full text and structured filters, while removing it never touches the notes it finds.",
    screenshot: search004Screenshot,
  },
  {
    id: "UI-005",
    title: "Navigation gains a steady rhythm",
    date: "September 8, 2026",
    description:
      "The sidebar now separates its fixed identity, scrollable navigation, local resources, and System footer into a calmer hierarchy, with consistent icons and compact selection blocks throughout.",
    screenshot: ui005Screenshot,
  },
  {
    id: "UI-006",
    title: "System controls become immediate",
    date: "September 8, 2026",
    description:
      "Dark mode, Settings, and local help now form a compact utility group at the foot of the sidebar, with a persistent accessible switch and direct paths to existing NODI controls.",
    screenshot: ui006Screenshot,
  },
  {
    id: "UI-007",
    title: "Settings finds one clear home",
    date: "September 8, 2026",
    description:
      "The duplicate Settings icon leaves the NODI header, while its existing menu moves intact to the clearly labeled Settings row in the System section.",
    screenshot: ui007Screenshot,
  },
  {
    id: "PRIVACY-001",
    title: "Private notes stay private",
    date: "September 11, 2026",
    description:
      "Notes can now be marked private, hide their title and preview in the library, stay out of search, and require a locally verified password before their contents can be opened.",
    screenshot: privacy001Screenshot,
  },
  {
    id: "UI-008",
    title: "Lists find a tighter rhythm",
    date: "September 15, 2026",
    description:
      "Bullet, numbered, and task lists now use a compact line height, while checklist text sits cleanly beside its aligned checkbox without extra paragraph spacing.",
    screenshot: ui008Screenshot,
  },
];

function About({ onClose }: AboutProps) {
  return (
    <main className="about-page">
      <header className="about-header">
        <div>
          <p className="eyebrow">ABOUT</p>
          <h1>The making of NODI</h1>
          <p className="about-intro">
            A visual record of each deliberate step from an empty native shell
            to a trustworthy personal notes app.
          </p>
        </div>
        <button className="text-button" type="button" onClick={onClose}>
          Back to NODI
        </button>
      </header>

      <ol className="timeline" aria-label="NODI implementation history">
        {evolution.map((entry) => (
          <li className="timeline-entry" key={entry.id}>
            <div className="entry-meta">
              <span>{entry.id}</span>
              <time>{entry.date}</time>
            </div>
            <div className="entry-content">
              <h2>{entry.title}</h2>
              <p>{entry.description}</p>
              <img
                src={entry.screenshot}
                alt={`NODI after completing ${entry.id}: ${entry.title}`}
              />
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}

export default About;

# ABOUT — The making of NODI

This page is the durable source record for the visual history presented by the in-app **ABOUT** page.

Every completed implementation task adds one chronological entry and one immutable screenshot of the current native NODI window. Screenshots are stored in `docs/about/screenshots/` and must never contain other applications or unrelated desktop content.

## 001 — FND-001 Native shell

**Completed:** September 7, 2026  
**Commit:** `5b9d9ee`

The first NODI window: a clean Tauri 2, React, TypeScript, and Vite baseline running natively on macOS.

![NODI after FND-001](about/screenshots/fnd-001-native-shell.png)

## 002 — DOC-001 Visual history rule

**Completed:** September 7, 2026

ABOUT was added as a permanent, accessible timeline inside NODI. Capturing the current native window and adding an evolution entry is now part of every implementation task's Definition of Done.

![NODI after DOC-001](about/screenshots/doc-001-about-rule.png)

## 003 — FND-002 Tooling

**Completed:** September 7, 2026

The interface remains intentionally stable while the project gains a reliable development loop: TypeScript checking, Biome linting and formatting, Vitest component tests, and Playwright browser-level tests.

![NODI after FND-002](about/screenshots/fnd-002-tooling.png)

## 004 — FND-003 Project structure

**Completed:** September 7, 2026

The visible baseline stays stable while application startup, global styles, and ABOUT move into clear, one-directional project layers. Future feature directories will be created only when they contain real implementation, avoiding empty speculative abstractions.

![NODI after FND-003](about/screenshots/fnd-003-project-structure.png)

## 005 — FND-004 Design tokens

**Completed:** September 7, 2026

NODI gains a shared visual foundation for color, typography, spacing, borders, radii, and motion. An accessible theme selector supports System, Light, and Dark preferences, persists the choice locally, and applies the same tokens to ABOUT.

![NODI after FND-004](about/screenshots/fnd-004-design-tokens.png)

### Dark mode

The ABOUT timeline and its historical screenshots remain readable and visually consistent when NODI follows a dark appearance.

![NODI ABOUT in Dark mode](about/screenshots/fnd-004-dark-mode.png)

## 006 — FND-005 Desktop shell

**Completed:** September 7, 2026

The native window becomes NODI's stable three-column workspace: a 232px sidebar, a 320px note list, and a flexible editor canvas. Semantic regions, visible focus, honest empty states, and a 900px minimum window width establish the foundation for note features without exposing unfinished destinations.

![NODI after FND-005](about/screenshots/fnd-005-desktop-shell.png)
